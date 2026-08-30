import { auth } from "@/auth";
import type { VoteState } from "@/lib/mods/vote";
import { prisma } from "@/lib/prisma";
import { upsertSessionUser } from "@/lib/session-user";

/** L'état du vote après écriture, tel que le bouton doit l'afficher (US-F1, US-F2). */
async function voteState(modId: string, hasVoted: boolean): Promise<VoteState> {
  return { modId, votes: await prisma.vote.count({ where: { modId } }), hasVoted };
}

/**
 * US-F1 — voter pour un mod.
 *
 * Un membre, un vote par fiche : c'est la contrainte `@@unique([userId, modId])` du
 * modèle `Vote` qui le garantit, pas une vérification préalable — deux clics partis en
 * même temps ne peuvent donc pas produire deux lignes. `skipDuplicates` rend la route
 * idempotente : re-voter ne change rien et répond le même état, plutôt qu'une erreur
 * pour un vote qui est déjà exactement celui qu'on demande.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/mods/[id]/vote">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [mod, voter] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: { id: true } }),
      // Voter est souvent la première écriture d'un membre : sa ligne `User` peut
      // très bien ne pas exister encore.
      upsertSessionUser(session.user),
    ]);

    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    await prisma.vote.createMany({
      data: { userId: voter.id, modId: id },
      skipDuplicates: true,
    });

    return Response.json(await voteState(id, true));
  } catch (error) {
    console.error(`POST /api/mods/${id}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être enregistré." }, { status: 500 });
  }
}

/**
 * US-F1 — retirer son vote.
 *
 * Le backlog ne demande que le POST, mais le bouton qu'il décrit a deux états : sans
 * cette route, l'état actif serait sans retour. Idempotente elle aussi — retirer un
 * vote qu'on n'a pas est déjà le résultat voulu.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/mods/[id]/vote">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const [mod, voter] = await Promise.all([
      prisma.mod.findUnique({ where: { id }, select: { id: true } }),
      // Rien à créer ici, contrairement au POST : sans ligne `User`, ce membre n'a
      // jamais rien écrit, donc jamais voté.
      prisma.user.findUnique({ where: { discordId: session.user.id }, select: { id: true } }),
    ]);

    if (!mod) {
      return Response.json({ error: "Cette fiche n'existe pas." }, { status: 404 });
    }

    if (voter) {
      await prisma.vote.deleteMany({ where: { userId: voter.id, modId: id } });
    }

    return Response.json(await voteState(id, false));
  } catch (error) {
    console.error(`DELETE /api/mods/${id}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être retiré." }, { status: 500 });
  }
}
