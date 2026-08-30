import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertSessionUser } from "@/lib/session-user";
import { currentSoireeId } from "@/lib/soirees/current";
import { readVoteState } from "@/lib/soirees/vote";

/**
 * Voter pour un mod depuis le catalogue ou depuis sa fiche (US-F1), c'est-à-dire sans
 * nommer de soirée.
 *
 * Depuis US-G3, un vote n'existe que dans le cadre d'une soirée : cette route résout
 * donc la soirée en cours, et c'est le **même vote** que celui de la page soirée —
 * la même ligne, la même contrainte d'unicité. Les trois boutons de l'application
 * écrivent au même endroit, ce qui est exactement ce qu'on attend d'eux : cliquer
 * depuis une carte puis rouvrir la soirée doit montrer le vote déjà là.
 *
 * Elle existe en plus de `/api/soirees/[id]/mods/[modId]/vote` parce que le catalogue
 * n'a aucune raison de connaître l'identifiant de la soirée du soir. Il tient une
 * fiche ; le serveur sait où on en est.
 */
async function resolveEngagement(modId: string) {
  const soireeId = await currentSoireeId();

  if (!soireeId) {
    return {
      error: "Aucune soirée n'est programmée : le vote rouvrira avec la prochaine.",
      status: 409 as const,
    };
  }

  const engagement = await prisma.soireeMod.findUnique({
    where: { soireeId_modId: { soireeId, modId } },
    select: { id: true },
  });

  if (!engagement) {
    // La règle de l'Epic G, telle que le membre la rencontre : seuls les mods engagés
    // dans la soirée en cours sont votables. On distingue quand même la fiche
    // inexistante, qui n'est pas la même erreur.
    const mod = await prisma.mod.findUnique({ where: { id: modId }, select: { id: true } });
    return mod
      ? {
          error: "Ce mod n'est pas engagé dans la soirée en cours : engage-le d'abord.",
          status: 409 as const,
        }
      : { error: "Cette fiche n'existe pas.", status: 404 as const };
  }

  return { engagement };
}

/** US-F1 / US-G3 — voter pour un mod dans la soirée en cours. */
export async function POST(_request: Request, ctx: RouteContext<"/api/mods/[id]/vote">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const resolved = await resolveEngagement(id);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    // Voter est souvent la première écriture d'un membre : sa ligne `User` peut très
    // bien ne pas exister encore.
    const voter = await upsertSessionUser(session.user);

    // L'unicité `@@unique([userId, soireeModId])` fait le travail : deux clics partis
    // en même temps ne produisent pas deux lignes, et re-voter répond le même état.
    await prisma.vote.createMany({
      data: { userId: voter.id, modId: id, soireeModId: resolved.engagement.id },
      skipDuplicates: true,
    });

    return Response.json(await readVoteState(id, resolved.engagement.id, true));
  } catch (error) {
    console.error(`POST /api/mods/${id}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être enregistré." }, { status: 500 });
  }
}

/**
 * US-F1 — retirer son vote. Idempotente : retirer un vote qu'on n'a pas est déjà le
 * résultat voulu.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/mods/[id]/vote">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const resolved = await resolveEngagement(id);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    // Rien à créer ici, contrairement au POST : sans ligne `User`, ce membre n'a jamais
    // rien écrit, donc jamais voté.
    const voter = await prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { id: true },
    });

    if (voter) {
      await prisma.vote.deleteMany({
        where: { userId: voter.id, soireeModId: resolved.engagement.id },
      });
    }

    return Response.json(await readVoteState(id, resolved.engagement.id, false));
  } catch (error) {
    console.error(`DELETE /api/mods/${id}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être retiré." }, { status: 500 });
  }
}
