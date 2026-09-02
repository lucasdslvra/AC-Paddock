import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sessionGuildId, upsertSessionUser } from "@/lib/session-user";
import { currentSoiree } from "@/lib/soirees/current";
import { isVoteOpen, voteClosedMessage } from "@/lib/soirees/phase";

const engageSchema = z.object({
  modId: z.string().min(1, "Choisis un mod à engager."),
});

/**
 * US-G2 — engager un mod du catalogue dans une soirée.
 *
 * Ouvert à tous les membres, contrairement à la création de la soirée : le cahier §2.5
 * dit « les membres associent des mods du catalogue à la soirée et votent », sans
 * restreindre à l'organisateur.
 *
 * Seule la soirée en cours accepte des engagements. Une soirée passée est un compte
 * rendu, pas un panier ; et une soirée programmée plus loin n'ouvrira qu'une fois
 * devenue la prochaine, sinon le groupe garnirait deux listes à la fois sans que le
 * classement de ce soir en tienne compte.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/soirees/[id]/mods">) {
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

  const parsed = engageSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Choisis un mod à engager." }, { status: 400 });
  }

  try {
    const [soiree, mod, member, current] = await Promise.all([
      prisma.soiree.findUnique({ where: { id }, select: { id: true } }),
      prisma.mod.findUnique({ where: { id: parsed.data.modId }, select: { id: true } }),
      // Engager est souvent la première écriture d'un membre : sa ligne `User` peut
      // très bien ne pas exister encore.
      upsertSessionUser(session.user),
      // Rapportée au serveur du membre : la soirée d'un autre groupe n'est pas la
      // sienne, et le refus ci-dessous vaut alors « plus ouverte aux engagements ».
      sessionGuildId(session).then((guildId) => currentSoiree(guildId)),
    ]);

    if (!soiree) {
      return Response.json({ error: "Cette soirée n'existe pas." }, { status: 404 });
    }
    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }
    if (soiree.id !== current?.id) {
      return Response.json(
        { error: "Cette soirée n'est plus ouverte aux engagements." },
        { status: 409 },
      );
    }
    // L'engagement se ferme avec le vote, 30 min avant le départ : un mod engagé après
    // coup n'est plus votable, il n'entrerait dans le classement que pour y rester à
    // zéro — et le groupe est en train de télécharger ce que ce classement a retenu.
    if (!isVoteOpen(current.date)) {
      return Response.json({ error: voteClosedMessage(current.date) }, { status: 409 });
    }

    // `skipDuplicates` s'appuie sur `@@unique([soireeId, modId])` : engager deux fois
    // le même mod est déjà exactement le résultat voulu, pas une erreur. Deux membres
    // qui cliquent en même temps sur la même fiche n'en produisent donc qu'une ligne —
    // celle du premier, avec son nom sur « engagé par ».
    await prisma.soireeMod.createMany({
      data: { soireeId: soiree.id, modId: mod.id, engagedById: member.id },
      skipDuplicates: true,
    });

    const engagement = await prisma.soireeMod.findUnique({
      where: { soireeId_modId: { soireeId: soiree.id, modId: mod.id } },
      select: { id: true },
    });

    return Response.json({ soireeModId: engagement?.id ?? null }, { status: 201 });
  } catch (error) {
    console.error(`POST /api/soirees/${id}/mods`, error);
    return Response.json({ error: "Ce mod n'a pas pu être engagé." }, { status: 500 });
  }
}
