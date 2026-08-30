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

/**
 * Le même comptage, pour plusieurs soirées d'un coup — l'historique (US-I1) en affiche
 * une par ligne, et un `countSoireeVoters` par ligne ferait autant d'allers-retours
 * qu'il y a de soirées passées.
 *
 * Les votes sont ramenés puis dédoublonnés ici, faute de mieux : Prisma ne sait pas
 * grouper sur un champ de relation (`soireeMod.soireeId`), et un `distinct: ["userId"]`
 * dédoublonnerait globalement — un membre présent à trois soirées ne compterait qu'une
 * fois, dans une seule d'entre elles. Le groupe est fermé et petit (cahier §1) : la
 * liste tient largement en mémoire.
 */
export async function countVotersBySoiree(soireeIds: string[]): Promise<Map<string, number>> {
  if (soireeIds.length === 0) return new Map();

  const votes = await prisma.vote.findMany({
    where: { soireeMod: { soireeId: { in: soireeIds } } },
    select: { userId: true, soireeMod: { select: { soireeId: true } } },
  });

  const voters = new Map<string, Set<string>>();
  for (const vote of votes) {
    // Le `where` exclut déjà les votes hérités du MVP (`soireeModId` à NULL), mais le
    // type, lui, garde la relation facultative.
    const soireeId = vote.soireeMod?.soireeId;
    if (!soireeId) continue;

    const seen = voters.get(soireeId) ?? new Set<string>();
    seen.add(vote.userId);
    voters.set(soireeId, seen);
  }

  // Toutes les soirées demandées sont dans la réponse, y compris celles où personne
  // n'a voté : l'appelant lit une valeur, pas une absence.
  return new Map(soireeIds.map((id) => [id, voters.get(id)?.size ?? 0]));
}
