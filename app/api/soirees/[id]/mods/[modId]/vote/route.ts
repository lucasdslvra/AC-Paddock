import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sessionGuildId, upsertSessionUser } from "@/lib/session-user";
import { currentSoireeId } from "@/lib/soirees/current";
import { castVote, readVoteState } from "@/lib/soirees/vote";

/**
 * L'engagement visé, une fois vérifié qu'on a le droit d'y voter (US-G3).
 *
 * Trois refus possibles, et ils ne disent pas la même chose : la soirée n'existe pas,
 * elle n'est plus celle où l'on vote, ou le mod n'y est pas engagé. Le dernier est la
 * règle centrale de l'Epic G — seuls les mods engagés sont votables.
 */
async function resolveEngagement(soireeId: string, modId: string, session: Session) {
  const [engagement, currentId] = await Promise.all([
    prisma.soireeMod.findUnique({
      where: { soireeId_modId: { soireeId, modId } },
      // Le type de la fiche vient avec l'engagement : c'est lui qui désigne le quota du
      // membre (8 véhicules, 3 circuits — `VOTE_QUOTA`).
      select: { id: true, mod: { select: { type: true } } },
    }),
    // La soirée en cours du serveur de ce membre : la soirée d'un autre groupe n'est
    // jamais « la sienne », et le premier refus ci-dessous s'en charge.
    sessionGuildId(session).then(currentSoireeId),
  ]);

  if (soireeId !== currentId) {
    return { error: "Le vote de cette soirée est clos.", status: 409 as const };
  }
  if (!engagement) {
    return {
      error: "Ce mod n'est pas engagé dans cette soirée : engage-le d'abord.",
      status: 404 as const,
    };
  }

  return { engagement };
}

/**
 * US-G3 — voter pour un mod engagé dans une soirée.
 *
 * Un membre, un vote par mod engagé, par soirée : c'est la contrainte
 * `@@unique([userId, soireeModId])` qui le garantit, pas une vérification préalable —
 * deux clics partis en même temps ne peuvent donc pas produire deux lignes. La route
 * reste idempotente : re-voter ne change rien et répond le même état, plutôt qu'une
 * erreur pour un vote qui est déjà celui qu'on demande.
 *
 * Le nombre de votes, lui, est borné par type et par soirée (`VOTE_QUOTA` : 8 véhicules,
 * 3 circuits) — c'est `castVote` qui compte et qui refuse, pour cette route comme pour
 * celle du catalogue.
 */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/soirees/[id]/mods/[modId]/vote">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id, modId } = await ctx.params;

  try {
    const resolved = await resolveEngagement(id, modId, session);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    // Voter est souvent la première écriture d'un membre : sa ligne `User` peut très
    // bien ne pas exister encore.
    const voter = await upsertSessionUser(session.user);

    const rejected = await castVote({
      userId: voter.id,
      modId,
      type: resolved.engagement.mod.type,
      soireeId: id,
      soireeModId: resolved.engagement.id,
    });
    if (rejected) {
      return Response.json({ error: rejected.error }, { status: rejected.status });
    }

    return Response.json(await readVoteState(modId, resolved.engagement.id, true));
  } catch (error) {
    console.error(`POST /api/soirees/${id}/mods/${modId}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être enregistré." }, { status: 500 });
  }
}

/**
 * US-G3 — retirer son vote.
 *
 * Le backlog ne demande que le POST, mais le bouton qu'il décrit a deux états : sans
 * cette route, l'état actif serait sans retour. Idempotente elle aussi — retirer un
 * vote qu'on n'a pas est déjà le résultat voulu.
 */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/soirees/[id]/mods/[modId]/vote">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id, modId } = await ctx.params;

  try {
    const resolved = await resolveEngagement(id, modId, session);
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

    return Response.json(await readVoteState(modId, resolved.engagement.id, false));
  } catch (error) {
    console.error(`DELETE /api/soirees/${id}/mods/${modId}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être retiré." }, { status: 500 });
  }
}
