import "server-only";
import type { ModType } from "@/lib/generated/prisma/enums";
import type { VoteState } from "@/lib/mods/vote";
import { prisma } from "@/lib/prisma";
import { quotaReachedMessage, VOTE_QUOTA } from "./quota";

/** Un vote refusé, dans la forme que les deux routes de vote rendent telle quelle. */
export interface VoteRejection {
  error: string;
  status: 409;
}

/**
 * Écrire un vote de plus d'un membre sur un engagement, dans la limite de sa réserve du
 * soir (`VOTE_QUOTA` : 8 véhicules, 3 circuits par soirée).
 *
 * **Un vote de plus, et non « le » vote.** Un membre peut en empiler plusieurs sur le
 * même mod : rien ne l'oblige à répartir sa réserve, et concentrer ses huit voix sur une
 * seule voiture est un choix aussi valable que de les étaler. Chaque appel écrit donc
 * une ligne, et seul le quota l'arrête.
 *
 * Ce qui se perd au passage, et qu'il faut savoir : la route n'est plus idempotente. Un
 * POST rejoué — réseau capricieux, double clic — ajoute un vote au lieu de redire le
 * même état, parce qu'il n'y a plus moyen de distinguer le renvoi d'une requête d'un
 * second vote délibéré. C'est le prix de l'empilement, et l'interface s'y range : elle
 * envoie un appel par clic, sans bascule à deviner.
 *
 * Partagé par les deux routes de vote — celle du catalogue et celle de la page soirée
 * écrivent dans la même table, et doivent donc compter la même chose. Rend `null` quand
 * le vote est écrit, le refus sinon.
 */
export async function castVote(vote: {
  userId: string;
  modId: string;
  /** Le type de la fiche : c'est lui qui désigne le quota à vérifier. */
  type: ModType;
  soireeId: string;
  soireeModId: string;
}): Promise<VoteRejection | null> {
  // Une clé, pas une ligne : le quota est une *absence* de votes, il n'y a rien à
  // verrouiller dans la table. Deux membres — ou le même sur l'autre type — ne hachent
  // pas la même chaîne et ne s'attendent donc jamais.
  const lockKey = `${vote.userId}:${vote.soireeId}:${vote.type}`;

  return prisma.$transaction(async (tx) => {
    // Le comptage et l'écriture qui suivent doivent être indivisibles : sans ce verrou,
    // deux votes partis en même temps se comptent l'un l'autre comme absents, passent
    // tous les deux le contrôle, et le membre place un neuvième véhicule. C'est
    // désormais la *seule* garantie du quota — l'unicité qui doublait la mise sur un
    // même mod est tombée avec l'empilement (`20260905140000_votes_multiples`), et deux
    // clics sur la même voiture sont exactement le cas qu'elle ne couvrait pas.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

    const used = await tx.vote.count({
      where: {
        userId: vote.userId,
        soireeMod: { soireeId: vote.soireeId },
        mod: { type: vote.type },
      },
    });
    if (used >= VOTE_QUOTA[vote.type]) {
      return { error: quotaReachedMessage(vote.type), status: 409 as const };
    }

    // `modId` est écrit à côté de `soireeModId` bien qu'il en soit déductible : c'est la
    // colonne sur laquelle le catalogue compte et trie (US-E4), et la seule qui rattache
    // encore les votes hérités du MVP à une fiche.
    await tx.vote.create({
      data: { userId: vote.userId, modId: vote.modId, soireeModId: vote.soireeModId },
    });

    return null;
  });
}

/**
 * Retirer **un** vote d'un membre sur un engagement — le dernier posé.
 *
 * Un seul, et non tous ceux qu'il y a mis : depuis l'empilement, le bouton « − » défait
 * un clic, pas une opinion. Retirer la pile entière ferait d'un dépassement de un clic
 * la perte de huit votes.
 *
 * Le plus récent plutôt que le plus ancien parce que c'est celui qu'on vient de poser :
 * défaire, c'est revenir à l'état d'avant le dernier geste. Les lignes étant par
 * ailleurs interchangeables, le choix ne se voit nulle part — sauf ici.
 *
 * Idempotent, lui : sans vote à retirer il n'y a rien à faire, et c'est déjà le résultat
 * voulu. Le `deleteMany` sur un identifiant précis plutôt qu'un `delete` évite l'erreur
 * de deux retraits partis ensemble, où le second ne trouverait plus sa ligne.
 */
export async function retractVote(vote: {
  userId: string;
  soireeModId: string;
}): Promise<void> {
  const last = await prisma.vote.findFirst({
    where: { userId: vote.userId, soireeModId: vote.soireeModId },
    // `createdAt` a la milliseconde pour résolution : deux votes du même clic répété
    // peuvent la partager, et l'identifiant ferme alors le tri. Sans lui, « le dernier »
    // dépendrait de l'ordre que la base voudrait bien rendre.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (last) await prisma.vote.deleteMany({ where: { id: last.id } });
}

/**
 * L'état du vote après écriture, tel que les boutons doivent l'afficher (US-F2, US-G4).
 *
 * Les trois comptes sont relus en base plutôt que dérivés du nombre optimiste tenu par
 * le navigateur : le membre n'est pas seul à voter, et c'est le seul moment où l'on
 * peut lui rendre le compte réel — celui des autres compris.
 *
 * `myVotes` en fait partie depuis l'empilement, et n'est plus déductible du verbe
 * employé : un POST ne veut plus dire « il en a un », il veut dire « il en a un de plus
 * qu'avant », et l'interface a besoin du nombre pour peindre son incrémenteur.
 */
export async function readVoteState(
  modId: string,
  soireeModId: string,
  userId: string,
): Promise<VoteState> {
  const [votes, soireeVotes, myVotes] = await Promise.all([
    prisma.vote.count({ where: { modId } }),
    prisma.vote.count({ where: { soireeModId } }),
    prisma.vote.count({ where: { soireeModId, userId } }),
  ]);

  return { modId, votes, soireeVotes, myVotes };
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
