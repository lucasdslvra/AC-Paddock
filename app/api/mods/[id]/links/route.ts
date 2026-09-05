import { auth } from "@/auth";
import { recordContribution } from "@/lib/mods/contributions";
import { formatLinkLabel } from "@/lib/mods/format";
import { MAX_LINKS_PER_MOD, modLinkSchema, toFieldErrors } from "@/lib/mods/schema";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { modUrlKey } from "@/lib/mods/url";
import { prisma } from "@/lib/prisma";
import { upsertSessionUser } from "@/lib/session-user";
import { soireeContext } from "@/lib/soirees/current";

/**
 * Cahier §2.2 — ajouter un lien secondaire à une fiche (miroir, pack de textures, patch).
 *
 * Ouvert à tout membre connecté, comme l'édition de la fiche (US-B3) : c'est justement
 * le geste que le cahier prête aux *autres* membres, pas à l'auteur.
 *
 * Une route à part plutôt qu'un champ de plus dans le PATCH : un lien porte le nom de
 * celui qui l'a ajouté, et un envoi de la liste entière réattribuerait les liens des
 * autres à celui qui enregistre. Ici chaque ajout ne touche que sa propre ligne — deux
 * membres qui complètent la même fiche en même temps ne s'écrasent pas.
 *
 * La fiche complète est renvoyée, comme par PATCH : l'appelant réaffiche sans redemander.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/mods/[id]/links">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = modLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "Lien invalide.", fieldErrors: toFieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  try {
    const [mod, member, soiree] = await Promise.all([
      prisma.mod.findUnique({
        where: { id },
        select: { id: true, url: true, links: { select: { url: true } } },
      }),
      // Ajouter un lien est souvent la première écriture d'un membre : sa ligne `User`
      // peut très bien ne pas exister encore.
      upsertSessionUser(session.user),
      soireeContext(session),
    ]);

    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    if (mod.links.length >= MAX_LINKS_PER_MOD) {
      return Response.json(
        {
          error: `Cette fiche porte déjà ${MAX_LINKS_PER_MOD} liens secondaires : retires-en un avant d'en ajouter un autre.`,
        },
        { status: 409 },
      );
    }

    // Le même lien deux fois n'apprend rien à personne. On compare sur la forme
    // normalisée (US-D2), qui ignore les paramètres de suivi et le `www.` — sinon deux
    // copies de la même adresse passeraient pour deux liens différents.
    const key = modUrlKey(parsed.data.url);
    const alreadyThere =
      (mod.url !== null && modUrlKey(mod.url) === key) ||
      mod.links.some((link) => modUrlKey(link.url) === key);
    if (alreadyThere) {
      return Response.json(
        { error: "Ce lien est déjà sur la fiche.", fieldErrors: { url: "Ce lien est déjà sur la fiche." } },
        { status: 409 },
      );
    }

    await prisma.modLink.create({
      data: {
        modId: mod.id,
        label: parsed.data.label ?? null,
        url: parsed.data.url,
        addedById: member.id,
      },
    });

    // Cahier §2.2 — le fil de la fiche. Le lien porte déjà le nom de celui qui l'a
    // ajouté, mais pas la date : c'est le fil qui situe le geste parmi les autres.
    // Sans intitulé, le domaine — celui que la fiche affiche à sa place.
    await recordContribution(mod.id, member.id, {
      kind: "LINK_ADDED",
      detail: parsed.data.label ?? formatLinkLabel(parsed.data.url),
    });

    const updated = await prisma.mod.findUniqueOrThrow({
      where: { id },
      include: modInclude(session.user.id, soiree),
    });

    return Response.json(serializeMod(updated, soiree.current?.id ?? null, session.user.id), {
      status: 201,
    });
  } catch (error) {
    console.error(`POST /api/mods/${id}/links`, error);
    return Response.json({ error: "Ce lien n'a pas pu être ajouté." }, { status: 500 });
  }
}
