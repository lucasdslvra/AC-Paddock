import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { notifyModCreated, requestOrigin } from "@/lib/discord/notify";
import type { ModOrderByWithRelationInput, ModWhereInput } from "@/lib/generated/prisma/models";
import { escapeLikeWildcards } from "@/lib/mods/like";
import {
  MODS_PER_PAGE,
  parseModQuery,
  type ModListResponse,
  type ModQuery,
  type ModSort,
  type ModTypeCounts,
} from "@/lib/mods/query";
import { modInputSchema, toFieldErrors } from "@/lib/mods/schema";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { buildTagCreateWrite } from "@/lib/mods/tags-store";
import { modUrlKey } from "@/lib/mods/url";
import { prisma } from "@/lib/prisma";
import { upsertSessionUser } from "@/lib/session-user";
import { soireeContext } from "@/lib/soirees/current";
import { isModImageUrl } from "@/lib/supabase/storage";

/**
 * Le drapeau « engager directement » de POST (US-G2), lu à part de la fiche elle-même.
 * Non strict : un corps qui ne le porte pas crée simplement une fiche non engagée.
 */
const engageFlagSchema = z.object({ engage: z.boolean().optional() });

/**
 * Ordre des fiches, par option de tri (US-E4).
 *
 * Le second critère n'est pas décoratif : deux fiches créées dans la même milliseconde
 * s'échangeraient d'une page à l'autre, et la pagination par décalage en sauterait une
 * tout en en montrant une autre deux fois.
 */
const MOD_ORDER_BY: Record<ModSort, ModOrderByWithRelationInput[]> = {
  date: [{ createdAt: "desc" }, { id: "desc" }],
  // US-F2 — le classement par votes. Deux fiches à égalité de votes (le cas le plus
  // courant : zéro) se départagent par date, comme dans l'autre tri.
  votes: [{ votes: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }],
  // Le classement alphabétique est celui de Postgres, sous la collation de la base
  // (`en_US.UTF-8`) : casse et accents y sont traités comme le lecteur les lit —
  // « Élise » se range à E, et « ferrari » n'atterrit pas après « Zonda ».
  az: [{ name: "asc" }, { id: "asc" }],
  za: [{ name: "desc" }, { id: "desc" }],
};

/**
 * Filtres portant sur le contenu des fiches — tags (US-C2) et recherche par nom
 * (US-E3). Le type en est volontairement absent : les compteurs du filtre par type
 * (US-E2) se comptent sur ces filtres-là seulement, la liste y ajoute le type choisi.
 */
function contentFilters(query: ModQuery): ModWhereInput[] {
  // Les tags se **combinent** (ET, pas OU) : `drift + jdm` ne ramène que les fiches qui
  // portent les deux, ce que demande le cahier §2.3. D'où un `some` par tag plutôt qu'un
  // seul `in` — `{ tags: { some: { tag: { name: { in: [...] } } } } }` répondrait « au
  // moins un des deux », ce qui n'est pas la même question.
  const filters: ModWhereInput[] = query.tags.map((name) => ({ tags: { some: { tag: { name } } } }));

  // US-E3 — `contains` + `insensitive` part en `ILIKE '%…%'`, servi par l'index GIN
  // trigram posé sur `Mod.name` (migration `20260829200000_duplicate_detection`). La
  // recherche floue de la détection de doublons (US-D1) répond à une autre question —
  // « une fiche proche existe-t-elle déjà ? » — et garde sa route dédiée.
  //
  // Prisma insère la saisie telle quelle entre ses deux `%` : sans échappement, taper
  // `%` ramènerait tout le catalogue au lieu de rien.
  if (query.search) {
    filters.push({ name: { contains: escapeLikeWildcards(query.search), mode: "insensitive" } });
  }

  return filters;
}

/**
 * US-E1 à US-E4 — le catalogue : liste paginée, filtrable par tags et par type,
 * cherchable par nom, triable.
 *
 * `?tags=drift,jdm` (la forme qu'écrit le catalogue) et `?tags=drift&tags=jdm` sont
 * acceptées indifféremment, `tags[]` aussi. Tous les paramètres sont lus par
 * `parseModQuery`, le même analyseur que celui du catalogue : une valeur absente ou
 * hors domaine retombe des deux côtés sur la même valeur par défaut.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const query = parseModQuery(new URL(request.url).searchParams);
  const filters = contentFilters(query);
  const contentWhere: ModWhereInput | undefined = filters.length > 0 ? { AND: filters } : undefined;

  try {
    // La soirée en cours d'abord : c'est elle qui décide quelles fiches sont votables
    // (US-G3), et `modInclude` en a besoin pour construire sa jointure.
    const soiree = await soireeContext(session);

    const [byType, mods, soireeRecord] = await Promise.all([
      // Un `groupBy` plutôt qu'un `count` : il donne d'un seul aller-retour les
      // compteurs du filtre par type *et* le total de la requête, qui n'est que leur
      // somme — ou la ligne du type choisi.
      prisma.mod.groupBy({ by: ["type"], where: contentWhere, _count: { _all: true } }),
      prisma.mod.findMany({
        where: query.type ? { ...contentWhere, type: query.type } : contentWhere,
        include: modInclude(session.user.id, soiree),
        orderBy: MOD_ORDER_BY[query.sort],
        skip: (query.page - 1) * MODS_PER_PAGE,
        take: MODS_PER_PAGE,
      }),
      // Le panneau « prochaine soirée » du catalogue, et de quoi expliquer un bouton
      // de vote éteint. `null` tant qu'aucune soirée n'est programmée.
      soiree.current
        ? prisma.soiree.findUnique({
            where: { id: soiree.current.id },
            include: { createdBy: true, _count: { select: { mods: true } } },
          })
        : null,
    ]);

    // Un type sans aucune fiche est absent du `groupBy` : il doit quand même afficher
    // son zéro, sinon le filtre perd une entrée dès que le catalogue se vide.
    const counts: ModTypeCounts = { all: 0, CAR: 0, TRACK: 0 };
    for (const row of byType) {
      counts[row.type] = row._count._all;
      counts.all += row._count._all;
    }

    const total = query.type ? counts[query.type] : counts.all;

    const body: ModListResponse = {
      mods: mods.map((mod) => serializeMod(mod, soiree.current?.id ?? null)),
      page: query.page,
      perPage: MODS_PER_PAGE,
      total,
      pageCount: Math.max(1, Math.ceil(total / MODS_PER_PAGE)),
      counts,
      currentSoiree: soireeRecord
        ? {
            id: soireeRecord.id,
            name: soireeRecord.name,
            date: soireeRecord.date.toISOString(),
            createdBy: {
              discordId: soireeRecord.createdBy.discordId,
              username: soireeRecord.createdBy.username,
              avatarUrl: soireeRecord.createdBy.avatarUrl,
            },
            isCurrent: true,
            modCount: soireeRecord._count.mods,
          }
        : null,
    };

    return Response.json(body);
  } catch (error) {
    console.error("GET /api/mods", error);
    return Response.json({ error: "Le catalogue n'a pas pu être chargé." }, { status: 500 });
  }
}

/**
 * US-B1 — création d'une fiche de mod.
 * Toutes les routes hors login exigent une session valide (cahier §3) : la
 * vérification d'appartenance au serveur Discord a déjà eu lieu au callback
 * d'authentification, une session signée suffit donc ici.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = modInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  // US-G2 — « engager directement » du formulaire de proposition. Le drapeau ne passe
  // pas par `modInputSchema`, qui ne décrit que ce qui va dans la table `Mod` : c'est
  // une action, pas un champ de la fiche. Tout ce qui n'est pas `true` vaut non.
  const engageFlag = engageFlagSchema.safeParse(payload);
  const engage = engageFlag.success && engageFlag.data.engage === true;

  // L'URL d'image ne peut venir que de notre propre route d'upload : on refuse
  // qu'une fiche pointe vers une image hébergée ailleurs.
  if (parsed.data.imageUrl && !isModImageUrl(parsed.data.imageUrl)) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: { imageUrl: "Image inconnue : dépose-la via le formulaire." } },
      { status: 400 },
    );
  }

  try {
    // La session porte l'identité Discord, pas un id de ligne User : on
    // crée/rafraîchit l'auteur avant de poser la clé étrangère.
    const author = await upsertSessionUser(session.user);
    const soiree = await soireeContext(session);

    // Les tags ne sont pas une colonne de `Mod` : on les sort du lot pour les écrire
    // comme des lignes `ModTag`, en créant au passage ceux qui n'existent pas encore.
    const { tags, ...fields } = parsed.data;

    const mod = await prisma.mod.create({
      // `urlKey` n'est pas saisi : c'est la forme normalisée du lien, ce que compare
      // GET /api/mods/check-url pour repérer un doublon (US-D2).
      data: {
        ...fields,
        urlKey: modUrlKey(fields.url),
        authorId: author.id,
        tags: await buildTagCreateWrite(tags),
        // L'engagement est écrit avec la fiche plutôt qu'en second appel : la soirée
        // visée est celle en cours **au moment de l'écriture**, que le serveur est seul
        // à connaître, et une fiche publiée mais non engagée par un aller-retour perdu
        // laisserait le membre croire qu'elle est dans la soirée. Sans soirée
        // programmée, il n'y a rien à engager — la case du formulaire ne s'affiche même
        // pas dans ce cas.
        ...(engage &&
          soiree.current && {
            soirees: { create: { soireeId: soiree.current.id, engagedById: author.id } },
          }),
      },
      include: modInclude(session.user.id, soiree),
    });

    // US-L2 — l'annonce dans le salon Discord, après la réponse : le membre qui vient
    // de proposer sa fiche voit sa page sans attendre Discord, et un salon injoignable
    // ne fait pas échouer une création. `after` garde l'invocation ouverte le temps de
    // l'envoi, y compris en serverless.
    const origin = requestOrigin(request);
    after(() =>
      notifyModCreated({
        id: mod.id,
        // Le serveur de l'auteur : c'est son groupe qui est prévenu de ce qu'il
        // propose. La fiche, elle, entre au catalogue commun.
        guildId: soiree.guildId,
        name: mod.name,
        type: mod.type,
        url: mod.url,
        description: mod.description,
        imageUrl: mod.imageUrl,
        tags: mod.tags.map((entry) => entry.tag.name),
        author: author.username,
        // La soirée n'est citée que si la fiche y a réellement été engagée : `engage`
        // sans soirée programmée n'engage rien (voir la création juste au-dessus).
        engagedIn: engage && soiree.current ? soiree.current : null,
        origin,
      }),
    );

    return Response.json(serializeMod(mod, soiree.current?.id ?? null), { status: 201 });
  } catch (error) {
    console.error("POST /api/mods", error);
    return Response.json({ error: "La fiche n'a pas pu être enregistrée." }, { status: 500 });
  }
}
