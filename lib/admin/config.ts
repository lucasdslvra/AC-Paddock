import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CONFIG_KEYS,
  DEFAULT_MOD_FILE_MO,
  MO,
  isSweepStale,
  parseModFileMo,
  parseModFileSweep,
  type ApiAdminConfig,
  type ApiModFileSweep,
} from "./settings";

/**
 * US-K3 — lecture et écriture des réglages de l'espace admin.
 *
 * La table ne contient que ce que quelqu'un a réellement changé : une clé absente n'est
 * pas une anomalie, c'est la valeur par défaut. Une valeur devenue invalide — bornes
 * resserrées depuis, ligne modifiée à la main en base — est traitée de la même façon,
 * plutôt que de faire échouer un upload sur un réglage illisible.
 */
export async function readAdminConfig(): Promise<ApiAdminConfig> {
  const [row, sweepRow] = await Promise.all([
    prisma.appConfig.findUnique({
      where: { key: CONFIG_KEYS.maxModFileMo },
      include: { updatedBy: { select: { username: true } } },
    }),
    prisma.appConfig.findUnique({ where: { key: CONFIG_KEYS.lastModFileSweep } }),
  ]);

  const stored = row ? parseModFileMo(Number(row.value)) : null;
  const lastSweep = sweepRow ? parseModFileSweep(sweepRow.value) : null;

  return {
    maxModFileMo: stored ?? DEFAULT_MOD_FILE_MO,
    // Pas de date ni d'auteur quand la valeur stockée est inutilisable : ce qui
    // s'applique alors est la valeur par défaut, que personne n'a posée.
    maxModFileUpdatedAt: stored === null ? null : row!.updatedAt.toISOString(),
    maxModFileUpdatedBy: stored === null ? null : (row!.updatedBy?.username ?? null),
    lastSweep,
    // Décidé ici, où l'heure courante peut être lue sans rendre un affichage non
    // déterministe (react-hooks/purity).
    sweepStale: isSweepStale(lastSweep),
  };
}

/**
 * US-H3 — inscrit le compte rendu du balayage qui vient de passer.
 *
 * Sans auteur : c'est une tâche planifiée qui écrit, pas un membre — `updatedById` est
 * nul, et le formulaire des réglages ne l'affiche de toute façon que pour le plafond
 * d'upload, qui lui est posé à la main.
 *
 * Ne relance pas d'erreur : un balayage réussi ne doit pas être rapporté comme un échec
 * parce que sa trace n'a pas pu s'écrire. C'est l'inverse qui serait trompeur — l'espace
 * admin afficherait alors un nettoyage plus ancien qu'il ne l'est, mais les fichiers, eux,
 * sont bien partis.
 */
export async function writeModFileSweep(sweep: ApiModFileSweep): Promise<void> {
  const value = JSON.stringify(sweep);
  try {
    await prisma.appConfig.upsert({
      where: { key: CONFIG_KEYS.lastModFileSweep },
      create: { key: CONFIG_KEYS.lastModFileSweep, value },
      update: { value, updatedById: null },
    });
  } catch (error) {
    console.error("Trace du balayage des fichiers expirés", error);
  }
}

/**
 * Le plafond d'upload en octets, tel que les routes d'upload du fichier de mod
 * (US-H1/H2) doivent le lire — c'est la raison d'être du réglage : le cahier §2.2 fait
 * de l'envoi du .zip une option à côté du lien externe, et §2.6 en confie le plafond à
 * l'admin. L'image d'aperçu (US-B2) garde le sien, en dur : elle est ré-encodée avant
 * stockage, sa limite est celle de ce que `sharp` doit accepter de lire, pas une
 * question d'espace disque.
 */
export async function maxModFileBytes(): Promise<number> {
  const { maxModFileMo } = await readAdminConfig();
  return maxModFileMo * MO;
}

/** Écrit le plafond d'upload. La valeur est supposée déjà validée par `parseModFileMo`. */
export async function writeMaxModFileMo(mo: number, actorId: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: CONFIG_KEYS.maxModFileMo },
    create: { key: CONFIG_KEYS.maxModFileMo, value: String(mo), updatedById: actorId },
    update: { value: String(mo), updatedById: actorId },
  });
}
