import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteModImages, listModImages, modImagePath } from "@/lib/supabase/storage";

/**
 * Délai de grâce avant qu'une image non référencée soit considérée orpheline.
 * Une image est déposée avant que la fiche existe : sans ce délai, le balayage
 * pourrait supprimer celle d'un formulaire encore ouvert.
 */
export const ORPHAN_GRACE_MS = 6 * 60 * 60 * 1000;

export interface OrphanSweepResult {
  scanned: number;
  deleted: number;
  keptRecent: number;
}

/**
 * Supprime du bucket les images qu'aucune fiche ne référence et qui ont dépassé le
 * délai de grâce. Rattrape ce que la suppression immédiate ne peut pas couvrir :
 * un formulaire abandonné en fermant l'onglet, ou un appel DELETE qui a échoué.
 */
export async function sweepOrphanImages(now: Date = new Date()): Promise<OrphanSweepResult> {
  const [stored, referencedRows] = await Promise.all([
    listModImages(),
    prisma.mod.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
  ]);

  const referenced = new Set<string>();
  for (const { imageUrl } of referencedRows) {
    const path = imageUrl ? modImagePath(imageUrl) : null;
    if (path) referenced.add(path);
  }

  const cutoff = now.getTime() - ORPHAN_GRACE_MS;
  const orphans: string[] = [];
  let keptRecent = 0;

  for (const file of stored) {
    if (referenced.has(file.path)) continue;
    if (file.createdAt.getTime() > cutoff) {
      keptRecent += 1;
      continue;
    }
    orphans.push(file.path);
  }

  await deleteModImages(orphans);

  return { scanned: stored.length, deleted: orphans.length, keptRecent };
}
