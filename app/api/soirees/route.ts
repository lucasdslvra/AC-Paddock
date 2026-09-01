import { after } from "next/server";
import { auth } from "@/auth";
import { authorizedGuildIds } from "@/lib/admin/guilds";
import { notifySoireeCreated, requestOrigin } from "@/lib/discord/notify";
import { prisma } from "@/lib/prisma";
import { sessionGuildId, upsertSessionUser } from "@/lib/session-user";
import { currentSoireeId, startOfToday } from "@/lib/soirees/current";
import { NO_GUILD } from "@/lib/soirees/scope";
import { listPastSoirees } from "@/lib/soirees/past";
import { canCreateSoiree } from "@/lib/soirees/permissions";
import { soireeInputSchema, toSoireeFieldErrors } from "@/lib/soirees/schema";
import type { ApiPastSoiree, ApiSoireeSummary } from "@/lib/soirees/serialize";

/**
 * Liste des soirées, de la plus proche à la plus ancienne.
 *
 * Le backlog ne demande que `GET /api/soirees/[id]` (US-G4), mais le sélecteur de mods
 * comme l'historique ont besoin de savoir quelles soirées existent — et sans cette
 * route, chacun devrait redécouvrir la règle de « la soirée en cours » de son côté.
 *
 * US-I1 — `?past=true` restreint la liste aux soirées déjà jouées et enrichit chaque
 * ligne du haut de son classement et de son nombre de votants. C'est un paramètre
 * plutôt qu'une route à part parce que c'est la même liste, filtrée : une soirée
 * passée et une soirée à venir ne diffèrent que par leur date, jamais par leur nature.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  // Seul `past=true` filtre : tout le reste (absent, `false`, une valeur inattendue)
  // laisse la liste complète, plutôt que de renvoyer une erreur pour un paramètre qui
  // n'est qu'une option d'affichage.
  const past = params.get("past") === "true";

  // Chaque serveur a ses soirées : celles d'un autre groupe ne sont pas « moins
  // récentes », elles ne le regardent pas.
  //
  // `?guild=` fait exception, et seulement pour un admin : c'est lui qui attribue les
  // soirées (US-G1), donc lui seul a besoin de regarder le calendrier d'un serveur qui
  // n'est pas le sien avant d'y en poser une. Le paramètre ne peut désigner qu'un
  // serveur autorisé — pas un identifiant quelconque.
  const requested = params.get("guild");
  let guildId = await sessionGuildId(session);

  if (requested && requested !== guildId) {
    const [actor, authorized] = await Promise.all([
      prisma.user.findUnique({
        where: { discordId: session.user.id },
        select: { role: true },
      }),
      authorizedGuildIds(),
    ]);

    if (actor?.role !== "ADMIN") {
      return Response.json({ error: "Réservé aux admins." }, { status: 403 });
    }
    if (!authorized.has(requested)) {
      return Response.json({ error: "Ce serveur n'est pas autorisé." }, { status: 404 });
    }

    guildId = requested;
  }

  if (past) {
    try {
      const body: ApiPastSoiree[] = await listPastSoirees(guildId);
      return Response.json(body);
    } catch (error) {
      console.error("GET /api/soirees?past=true", error);
      return Response.json(
        { error: "L'historique des soirées n'a pas pu être chargé." },
        { status: 500 },
      );
    }
  }

  try {
    const [soirees, currentId] = await Promise.all([
      prisma.soiree.findMany({
        where: { guildId: guildId ?? NO_GUILD },
        orderBy: { date: "desc" },
        include: { createdBy: true, _count: { select: { mods: true } } },
      }),
      currentSoireeId(guildId),
    ]);

    const body: ApiSoireeSummary[] = soirees.map((soiree) => ({
      id: soiree.id,
      name: soiree.name,
      date: soiree.date.toISOString(),
      createdBy: {
        discordId: soiree.createdBy.discordId,
        username: soiree.createdBy.username,
        avatarUrl: soiree.createdBy.avatarUrl,
      },
      isCurrent: soiree.id === currentId,
      modCount: soiree._count.mods,
    }));

    return Response.json(body);
  } catch (error) {
    console.error("GET /api/soirees", error);
    return Response.json({ error: "Les soirées n'ont pas pu être chargées." }, { status: 500 });
  }
}

/**
 * US-G1 — création d'une soirée, réservée aux admins (cahier §2.6 : c'est
 * l'admin/organisateur qui crée les soirées).
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

  const parsed = soireeInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: toSoireeFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  // Une soirée dans le passé serait créée déjà archivée : personne ne pourrait y
  // engager quoi que ce soit ni y voter, puisque `currentSoiree` ne regarde que
  // l'avenir. Le seuil est le même qu'elle — le début du jour, pas l'instant présent,
  // pour qu'on puisse programmer une soirée pour ce soir à 21 h en la créant à 22 h.
  if (parsed.data.date < startOfToday()) {
    return Response.json(
      { error: "Formulaire invalide.", fieldErrors: { date: "Cette date est déjà passée." } },
      { status: 400 },
    );
  }

  try {
    // Le rôle n'est pas dans la session : on le relit en base, ce qui évite qu'une
    // session ouverte avant un changement de rôle garde d'anciens droits. L'upsert
    // sert des deux côtés — c'est aussi la ligne `User` que la clé étrangère exige.
    const actor = await upsertSessionUser(session.user);

    if (!canCreateSoiree(actor)) {
      return Response.json(
        { error: "Seuls les admins créent les soirées." },
        { status: 403 },
      );
    }

    // À quel serveur cette soirée appartient. L'admin le choisit (US-G1 : c'est lui qui
    // crée les soirées, et il peut en organiser pour plusieurs groupes) ; sans choix,
    // c'est le serveur par lequel il est entré.
    //
    // Un serveur qui ne donne pas accès est refusé : la soirée y serait invisible de
    // tous, y compris de celui qui vient de la créer.
    const guildId = parsed.data.guildId ?? (await sessionGuildId(session));
    if (!guildId) {
      return Response.json(
        { error: "Ton serveur Discord n'a pas pu être déterminé : reconnecte-toi." },
        { status: 409 },
      );
    }

    const authorized = await authorizedGuildIds();
    if (!authorized.has(guildId)) {
      return Response.json(
        {
          error: "Formulaire invalide.",
          fieldErrors: { guildId: "Ce serveur ne donne pas accès à l'application." },
        },
        { status: 400 },
      );
    }

    const soiree = await prisma.soiree.create({
      data: {
        name: parsed.data.name ?? null,
        date: parsed.data.date,
        guildId,
        createdById: actor.id,
      },
    });

    // US-L1 — l'annonce dans le salon Discord, après la réponse : elle dépend d'un
    // service tiers, et l'admin qui vient de créer la soirée n'a pas à attendre que
    // Discord réponde pour voir sa soirée apparaître. `after` garde l'invocation
    // ouverte le temps de l'envoi, y compris en serverless.
    const origin = requestOrigin(request);
    after(() =>
      notifySoireeCreated({
        id: soiree.id,
        // Le salon prévenu est celui de ce serveur-là, pas de celui de l'admin : il
        // peut programmer une soirée pour un groupe dont il n'est pas.
        guildId: soiree.guildId,
        name: soiree.name,
        date: soiree.date,
        createdBy: actor.username,
        origin,
      }),
    );

    return Response.json({ id: soiree.id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/soirees", error);
    return Response.json({ error: "La soirée n'a pas pu être créée." }, { status: 500 });
  }
}
