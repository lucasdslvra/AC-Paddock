import "server-only";
import { notifyVoteReminder, type VoteReminderLaggard } from "@/lib/discord/notify";
import type { ModType } from "@/lib/generated/prisma/enums";
import { MOD_TYPES } from "@/lib/mods/type";
import { prisma } from "@/lib/prisma";
import { VOTE_CLOSES_BEFORE_MS, VOTE_REMINDER_BEFORE_CLOSE_MS } from "./phase";
import { VOTE_QUOTA } from "./quota";

/**
 * Le rappel d'avant fermeture : 30 minutes avant que le vote ferme, le salon Discord du
 * serveur reçoit un message qui mentionne les inscrits qui n'ont pas voté, ou pas fini.
 *
 * Appelé toutes les 5 minutes par `pg_cron` (prisma/cron/vote-reminders.sql), via
 * `/api/maintenance/vote-reminders`. Une soirée est concernée dès qu'elle entre dans la
 * fenêtre `[fermeture − 30 min, fermeture)` ; le rappel part donc au premier passage
 * dans cette fenêtre — entre 30 et 25 minutes avant la fermeture — et jamais après : un
 * rappel arrivé une fois le vote clos ne relancerait personne.
 *
 * « Pas fini » : pour chaque type qui a au moins un mod engagé ce soir-là, la réserve
 * n'est pas vide (`VOTE_QUOTA`). Un type sans engagement ne se vote pas, et n'y avoir
 * rien mis n'est pas un retard. Avec l'empilement, un seul engagement suffit à pouvoir
 * vider sa réserve.
 */

/** Ce que rend un passage du planificateur — le corps de la réponse de la route. */
export interface VoteReminderReport {
  /** Soirées entrées dans la fenêtre du rappel et pas encore rappelées. */
  checked: number;
  /** Soirées pour lesquelles un message est parti. */
  reminded: number;
  /** Membres mentionnés, toutes soirées confondues. */
  mentioned: number;
}

export async function sendVoteReminders(
  origin: string | null,
  now: Date = new Date(),
): Promise<VoteReminderReport> {
  // Fenêtre sur la date de départ : fermeture = départ − 30 min, rappel = fermeture −
  // 30 min. Prisma écrit et compare les `Date` en UTC, sans le piège du SQL brut
  // décrit dans `drawTieBreaks`.
  const soirees = await prisma.soiree.findMany({
    where: {
      voteReminderSentAt: null,
      date: {
        gt: new Date(now.getTime() + VOTE_CLOSES_BEFORE_MS),
        lte: new Date(now.getTime() + VOTE_CLOSES_BEFORE_MS + VOTE_REMINDER_BEFORE_CLOSE_MS),
      },
    },
    select: { id: true, guildId: true, name: true, date: true },
  });

  const report: VoteReminderReport = { checked: soirees.length, reminded: 0, mentioned: 0 };

  for (const soiree of soirees) {
    // La soirée est réservée avant l'envoi : deux passages simultanés du planificateur
    // (un appel rejoué, un déclenchement à la main) ne peuvent pas la prendre tous les
    // deux, et le salon ne reçoit qu'un rappel. Le prix : un envoi raté n'est pas
    // retenté — un rappel en double gênerait plus qu'un rappel manqué.
    const claimed = await prisma.soiree.updateMany({
      where: { id: soiree.id, voteReminderSentAt: null },
      data: { voteReminderSentAt: now },
    });
    if (claimed.count !== 1) continue;

    try {
      const laggards = await findLaggards(soiree.id);
      if (laggards.length === 0) continue;

      const sent = await notifyVoteReminder({ ...soiree, laggards, origin });
      if (sent) {
        report.reminded += 1;
        report.mentioned += laggards.length;
      }
    } catch (error) {
      console.error(`Rappel de vote — soirée ${soiree.id}`, error);
    }
  }

  return report;
}

/** Les inscrits dont la réserve n'est pas vide, sur les types votables ce soir-là. */
async function findLaggards(soireeId: string): Promise<VoteReminderLaggard[]> {
  const [participants, engaged] = await Promise.all([
    prisma.soireeParticipant.findMany({
      where: { soireeId },
      orderBy: { joinedAt: "asc" },
      select: { userId: true, user: { select: { discordId: true } } },
    }),
    prisma.soireeMod.findMany({
      where: { soireeId },
      select: { mod: { select: { type: true } } },
    }),
  ]);

  // Dans l'ordre de l'interface — véhicules puis circuits —, que suit aussi le message.
  const types = MOD_TYPES.filter((type) => engaged.some((entry) => entry.mod.type === type));
  // Rien d'engagé : il n'y a rien à voter, donc personne en retard.
  if (participants.length === 0 || types.length === 0) return [];

  // Un comptage par type : Prisma ne groupe pas sur un champ de relation (`mod.type`).
  const usedByType = new Map<ModType, Map<string, number>>();
  await Promise.all(
    types.map(async (type) => {
      const rows = await prisma.vote.groupBy({
        by: ["userId"],
        where: { soireeMod: { soireeId }, mod: { type } },
        _count: { _all: true },
      });
      usedByType.set(type, new Map(rows.map((row) => [row.userId, row._count._all])));
    }),
  );

  const laggards: VoteReminderLaggard[] = [];
  for (const participant of participants) {
    const used: Partial<Record<ModType, number>> = {};
    const quota: Partial<Record<ModType, number>> = {};
    let finished = true;

    for (const type of types) {
      used[type] = usedByType.get(type)?.get(participant.userId) ?? 0;
      quota[type] = VOTE_QUOTA[type];
      if (used[type] < VOTE_QUOTA[type]) finished = false;
    }

    if (!finished) laggards.push({ discordId: participant.user.discordId, used, quota });
  }

  return laggards;
}
