import "server-only";
import type { ModPlayedAt } from "@/lib/mock-data";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/soirees/current";
import { formatSoireeShortDay } from "@/lib/soirees/format";

/**
 * Cahier §2.5 / US-I1 — les soirées où cette fiche a déjà été jouée, et le rang qu'elle
 * y a tenu.
 *
 * L'information existe déjà en base (`SoireeMod` + `Vote`) mais n'était lisible que
 * depuis la soirée : la fiche montrait ses votes en barres, sans dire de quelles soirées
 * elles venaient ni ce qu'elles avaient donné. C'est le pendant de l'historique (US-I1),
 * vu depuis le mod plutôt que depuis la date.
 */

/**
 * Combien de soirées la fiche déroule. Au-delà, elle compte sans afficher : la question
 * que pose ce bloc est « ça a déjà tourné, et ça a donné quoi ? », à quoi les dernières
 * répondent — l'archive complète, elle, est dans l'historique.
 */
export const MOD_PLAYED_AT_LENGTH = 6;

/** Les soirées passées d'une fiche, telles que la fiche les affiche. */
export interface ModPlayedAtFeed {
  /** Les plus récentes d'abord, au plus `MOD_PLAYED_AT_LENGTH`. */
  entries: ModPlayedAt[];
  /** Soirées plus anciennes que celles renvoyées : la fiche affiche « + N ». */
  olderCount: number;
}

const EMPTY_FEED: ModPlayedAtFeed = { entries: [], olderCount: 0 };

export async function listModPlayedAt(modId: string, now?: Date): Promise<ModPlayedAtFeed> {
  // La borne est celle de `listPastSoirees` : une soirée est passée quand elle n'est
  // plus en cours, pas quand son heure exacte est dépassée. Sans ça, la soirée de ce
  // soir apparaîtrait ici comme « déjà jouée » pendant qu'on y joue — et le rang
  // affiché serait celui d'un vote encore ouvert.
  const played = { modId, soiree: { date: { lt: startOfToday(now) } } };

  const [engagements, total] = await Promise.all([
    prisma.soireeMod.findMany({
      where: played,
      orderBy: { soiree: { date: "desc" } },
      take: MOD_PLAYED_AT_LENGTH,
      select: {
        id: true,
        soireeId: true,
        createdAt: true,
        soiree: { select: { id: true, name: true, date: true } },
        _count: { select: { votes: true } },
      },
    }),
    prisma.soireeMod.count({ where: played }),
  ]);

  if (engagements.length === 0) return EMPTY_FEED;

  // Le rang ne se lit sur aucune ligne : il se compte parmi les *autres* mods de la même
  // soirée. D'où cette seconde requête — les concurrents de chacune des soirées
  // retenues, en un seul aller-retour plutôt qu'un par soirée.
  const rivals = await prisma.soireeMod.findMany({
    where: { soireeId: { in: engagements.map((entry) => entry.soireeId) } },
    select: { id: true, soireeId: true, createdAt: true, _count: { select: { votes: true } } },
  });

  const entries = engagements.map((entry) => ({
    sessionLabel: `Soirée du ${formatSoireeShortDay(entry.soiree.date)}`,
    theme: entry.soiree.name,
    href: `/soiree/${entry.soiree.id}`,
    rank: rankOf(entry, rivals),
    votes: entry._count.votes,
  }));

  return { entries, olderCount: Math.max(0, total - entries.length) };
}

interface Ranked {
  id: string;
  soireeId: string;
  createdAt: Date;
  _count: { votes: number };
}

/**
 * Le rang d'un engagement dans sa soirée : le nombre de mods qui le précèdent au
 * classement, plus un.
 *
 * L'ordre est celui de la soirée elle-même (`RANKING_ORDER`, lib/soirees/serialize.ts) —
 * votes décroissants, puis ordre d'engagement. Les ex æquo ne partagent donc pas leur
 * rang : ils sont départagés comme sur la page de la soirée, sinon la fiche annoncerait
 * « 1er » là où le classement affiche le mod en deuxième ligne.
 */
function rankOf(entry: Ranked, rivals: Ranked[]): number {
  const ahead = rivals.filter(
    (rival) =>
      rival.soireeId === entry.soireeId &&
      rival.id !== entry.id &&
      (rival._count.votes > entry._count.votes ||
        (rival._count.votes === entry._count.votes && rival.createdAt < entry.createdAt)),
  );

  return ahead.length + 1;
}
