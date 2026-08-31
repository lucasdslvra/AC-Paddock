import "server-only";
import type { DeletionTarget } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import type { ApiDeletionEntry } from "./settings";

/** Ce que le journal montre d'un coup. Au-delà, il compte sans afficher. */
export const DELETION_LOG_PAGE = 10;

interface DeletionRecord {
  target: DeletionTarget;
  targetId: string;
  /** Le nom de ce qui disparaît — à lire **avant** la suppression. */
  label: string;
  /** Ce que la suppression emporte : « 12 votes », « 3 fiches ». */
  detail?: string | null;
  /** Vrai si l'acteur agissait au titre de son rôle admin (US-K2). */
  asAdmin: boolean;
  actorId: string;
}

/**
 * US-K2 — inscrit une suppression au journal.
 *
 * N'échoue jamais bruyamment : une suppression déjà faite en base ne doit pas
 * ressortir en erreur 500 parce que sa trace n'a pas pu s'écrire — le contenu, lui,
 * est bien parti. L'échec reste dans les logs du serveur, où il se voit.
 *
 * À appeler après la suppression, pas avant : une suppression refusée par une
 * contrainte laisserait sinon une entrée qui décrit un contenu toujours en place.
 */
export async function recordDeletion(record: DeletionRecord): Promise<void> {
  try {
    await prisma.deletionLog.create({
      data: {
        target: record.target,
        targetId: record.targetId,
        label: record.label,
        detail: record.detail ?? null,
        asAdmin: record.asAdmin,
        actorId: record.actorId,
      },
    });
  } catch (error) {
    console.error("Journal des suppressions", error);
  }
}

export interface DeletionLogPage {
  entries: ApiDeletionEntry[];
  /** Entrées plus anciennes que celles renvoyées — le journal affiche « + N ». */
  olderCount: number;
}

/** Le journal, du plus récent au plus ancien. */
export async function listDeletions(take: number = DELETION_LOG_PAGE): Promise<DeletionLogPage> {
  const [rows, total] = await Promise.all([
    prisma.deletionLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: { actor: { select: { username: true } } },
    }),
    prisma.deletionLog.count(),
  ]);

  return {
    entries: rows.map((row) => ({
      id: row.id,
      target: row.target,
      targetId: row.targetId,
      label: row.label,
      detail: row.detail,
      asAdmin: row.asAdmin,
      actor: row.actor.username,
      createdAt: row.createdAt.toISOString(),
    })),
    olderCount: Math.max(0, total - rows.length),
  };
}
