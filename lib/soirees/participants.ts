import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Rejoindre une soirée, la quitter.
 *
 * Être sur le serveur Discord d'une soirée ne suffit plus pour en être : on la rejoint.
 * Tout le serveur n'est pas de toutes les soirées, et c'est la liste des inscrits — pas
 * celle des membres connus — qui dit qui vote, qui compte dans « ont voté », et qui le
 * rappel d'avant fermeture doit relancer (lib/soirees/vote-reminder.ts).
 */

/** Le refus opposé au vote et à l'engagement d'un membre qui n'a pas rejoint. */
export const NOT_JOINED_MESSAGE = "Rejoins la soirée pour engager et voter.";

/** Rejoindre. Idempotent : rejoindre deux fois laisse un seul inscrit. */
export async function joinSoiree(userId: string, soireeId: string): Promise<void> {
  await prisma.soireeParticipant.upsert({
    where: { soireeId_userId: { soireeId, userId } },
    create: { soireeId, userId },
    update: {},
  });
}

/**
 * Quitter, et emporter ses votes.
 *
 * Les votes partent avec l'inscription : le classement ne compte que les voix de ceux
 * qui viennent. Les mods que le membre a engagés restent, eux : d'autres ont pu voter
 * pour, et les retirer déferait leurs votes à leur place.
 *
 * Sous les mêmes verrous consultatifs que `castVote` (une clé par type) : sans eux, un
 * vote parti pendant qu'on quitte pourrait passer le contrôle d'inscription avant la
 * suppression, puis s'écrire après — un vote orphelin d'un membre qui n'en est plus.
 */
export async function leaveSoiree(userId: string, soireeId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const type of ["CAR", "TRACK"] as const) {
      const lockKey = `${userId}:${soireeId}:${type}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
    }

    await tx.vote.deleteMany({ where: { userId, soireeMod: { soireeId } } });
    await tx.soireeParticipant.deleteMany({ where: { soireeId, userId } });
  });
}

/** Ce membre a-t-il rejoint cette soirée ? Lisible dans une transaction. */
export async function isParticipant(
  userId: string,
  soireeId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const row = await client.soireeParticipant.findUnique({
    where: { soireeId_userId: { soireeId, userId } },
    select: { id: true },
  });
  return row !== null;
}
