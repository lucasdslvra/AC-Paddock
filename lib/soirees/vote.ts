import "server-only";
import type { VoteState } from "@/lib/mods/vote";
import { prisma } from "@/lib/prisma";

/**
 * L'état du vote après écriture, tel que les boutons doivent l'afficher (US-F2, US-G4).
 *
 * Les deux comptes sont relus en base plutôt que dérivés du nombre optimiste tenu par
 * le navigateur : le membre n'est pas seul à voter, et c'est le seul moment où l'on
 * peut lui rendre le compte réel — celui des autres compris.
 */
export async function readVoteState(
  modId: string,
  soireeModId: string,
  hasVoted: boolean,
): Promise<VoteState> {
  const [votes, soireeVotes] = await Promise.all([
    prisma.vote.count({ where: { modId } }),
    prisma.vote.count({ where: { soireeModId } }),
  ]);

  return { modId, votes, soireeVotes, hasVoted };
}

/** Membres distincts ayant voté dans une soirée — le « 5 / 8 ont voté » de la page. */
export async function countSoireeVoters(soireeId: string): Promise<number> {
  // `distinct` plutôt qu'un `count` : un membre qui a voté pour six mods est un votant,
  // pas six.
  const voters = await prisma.vote.findMany({
    where: { soireeMod: { soireeId } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return voters.length;
}
