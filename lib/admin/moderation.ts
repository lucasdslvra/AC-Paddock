import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminModRow, AdminTagRow } from "./settings";

/**
 * Ce que le tableau de modération charge d'un coup. Le cahier §2.6 confie à l'admin la
 * suppression de n'importe quel contenu, pas la relecture du catalogue entier : les
 * fiches qui appellent une décision sont les récentes, et le filtre de l'en-tête
 * travaille sur ce que la page a déjà. Au-delà, c'est le catalogue (US-E1) qui sert,
 * avec sa pagination — la suppression y est ouverte depuis chaque fiche.
 */
export const MODERATION_MOD_LIMIT = 60;

/** Même parti pris pour les tags, triés par usage : la longue traîne est en bas. */
export const MODERATION_TAG_LIMIT = 40;

export interface ModerationList<Row> {
  rows: Row[];
  /** Total en base, pour que l'en-tête dise « 60 des 214 fiches ». */
  total: number;
}

export async function listModerationMods(): Promise<ModerationList<AdminModRow>> {
  const [mods, total, duplicateKeys] = await Promise.all([
    prisma.mod.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MODERATION_MOD_LIMIT,
      select: {
        id: true,
        name: true,
        urlKey: true,
        imageUrl: true,
        createdAt: true,
        author: { select: { username: true } },
        _count: { select: { votes: true } },
      },
    }),
    prisma.mod.count(),
    // US-D2 — les liens portés par plus d'une fiche. Regroupé par la base plutôt que
    // recompté fiche par fiche : la question est « ce lien est-il partagé ? », et un
    // `groupBy` y répond en une requête pour tout le catalogue.
    prisma.mod.groupBy({
      by: ["urlKey"],
      _count: { urlKey: true },
      having: { urlKey: { _count: { gt: 1 } } },
    }),
  ]);

  const duplicatesByKey = new Map(duplicateKeys.map((row) => [row.urlKey, row._count.urlKey]));

  return {
    rows: mods.map((mod) => ({
      id: mod.id,
      name: mod.name,
      author: mod.author.username,
      createdAt: mod.createdAt.toISOString(),
      votes: mod._count.votes,
      imageUrl: mod.imageUrl,
      // Le groupe compte la fiche elle-même : ce qui intéresse le modérateur, ce sont
      // les autres.
      duplicates: Math.max(0, (duplicatesByKey.get(mod.urlKey) ?? 1) - 1),
    })),
    total,
  };
}

export async function listModerationTags(): Promise<ModerationList<AdminTagRow>> {
  const [tags, total] = await Promise.all([
    prisma.tag.findMany({
      // Les plus utilisés d'abord, comme dans l'autocomplétion (US-C1) : c'est le
      // vocabulaire installé, et les variantes à retirer se voient d'autant mieux
      // qu'elles sont juste à côté de lui.
      orderBy: [{ mods: { _count: "desc" } }, { name: "asc" }],
      take: MODERATION_TAG_LIMIT,
      select: { name: true, _count: { select: { mods: true } } },
    }),
    prisma.tag.count(),
  ]);

  return {
    rows: tags.map((tag) => ({ name: tag.name, modCount: tag._count.mods })),
    total,
  };
}
