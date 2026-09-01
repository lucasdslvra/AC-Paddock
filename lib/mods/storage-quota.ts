import "server-only";
import { MAX_TOTAL_STORAGE_BYTES, type ApiStorageUsage } from "@/lib/admin/settings";
import { prisma } from "@/lib/prisma";
import { totalStoredBytes } from "@/lib/r2/storage";
import { formatFileSize } from "./file";

/**
 * US-H1 — le quota global du bucket Cloudflare, et la réservation qui le rend tenable
 * quand plusieurs envois se croisent.
 *
 * Le total occupé se mesure sur le bucket (`totalStoredBytes`) : c'est ce que Cloudflare
 * facture. Mais un objet n'y apparaît qu'une fois l'envoi **terminé** — jusqu'à une heure
 * pour 1 Go. Pendant tout ce temps, un envoi en vol ne pèse rien de mesurable, et deux
 * membres qui démarrent ensemble passeraient tous les deux le même contrôle.
 *
 * D'où la table `ModFileReservation` : une ligne posée à la signature, retirée à la
 * confirmation, comptée dans le total tant que l'envoi est en vol. Elle porte une taille
 * *annoncée*, donc une promesse du client — mais une promesse qui ne peut que le
 * desservir, puisqu'annoncer moins ne fait pas passer plus : la taille réelle est relue
 * sur l'objet déposé (US-H2), et un dépassement y est refusé.
 */

/**
 * La forme est déclarée avec le reste du vocabulaire partagé (`ApiStorageUsage`) : le
 * panneau de l'espace admin l'affiche, et c'est un composant client — il ne peut pas
 * importer ce module-ci, qui traîne Prisma et le SDK S3.
 */
export type StorageUsage = ApiStorageUsage;

/** Ce que le bucket porte, et ce que les envois en cours lui promettent. */
export async function readStorageUsage(now: Date = new Date()): Promise<StorageUsage> {
  const [stored, reservations] = await Promise.all([
    totalStoredBytes(),
    // Les réservations périmées ne comptent pas : leur URL signée ne peut plus servir.
    // Elles ne sont pas supprimées ici — une lecture ne devrait pas écrire ; c'est le
    // balayage horaire d'US-H3 qui fait le ménage.
    prisma.modFileReservation.aggregate({
      _sum: { bytes: true },
      where: { expiresAt: { gt: now } },
    }),
  ]);

  const reserved = reservations._sum.bytes ?? 0;
  const used = stored + reserved;

  return {
    stored,
    reserved,
    used,
    free: Math.max(0, MAX_TOTAL_STORAGE_BYTES - used),
    limit: MAX_TOTAL_STORAGE_BYTES,
  };
}

/**
 * Ce qu'on répond à qui demande une place qui n'existe plus.
 *
 * Le message dit l'état, pas seulement le refus : « c'est plein » n'aide pas, alors que
 * savoir combien il reste et que ça se libère tout seul indique quoi faire — attendre,
 * ou passer par un lien externe.
 */
export function storageFullMessage(usage: StorageUsage): string {
  return usage.free === 0
    ? `Le stockage partagé est plein (${formatFileSize(usage.limit)}). Les fichiers déposés se libèrent 24 h après leur envoi — en attendant, passe par un lien externe.`
    : `Il ne reste que ${formatFileSize(usage.free)} sur les ${formatFileSize(usage.limit)} du stockage partagé. Attends qu'un fichier expire, ou passe par un lien externe.`;
}

/**
 * Retient `bytes` octets pour l'envoi qui écrira sous `key`, ou renvoie `null` si le
 * quota ne le permet pas.
 *
 * Lecture puis écriture, sans verrou : deux demandes rigoureusement simultanées peuvent
 * lire le même total et réserver toutes les deux. C'est assumé — la fenêtre se compte en
 * millisecondes pour un groupe de quelques membres, et le dépassement possible est borné
 * par un fichier. Le prix d'un verrou sérieux (transaction sérialisable, ou compteur
 * verrouillé) ne se justifie pas contre ça, alors que l'absence totale de réservation,
 * elle, laissait une fenêtre d'une heure.
 */
export type ReservationResult =
  | { ok: true }
  /** Refusée : `usage` dit pourquoi, et sert à composer le message. */
  | { ok: false; usage: StorageUsage };

export async function reserveStorage(
  key: string,
  modId: string,
  bytes: number,
  expiresAt: Date,
  now: Date = new Date(),
): Promise<ReservationResult> {
  const usage = await readStorageUsage(now);
  if (bytes > usage.free) return { ok: false, usage };

  await prisma.modFileReservation.create({ data: { key, modId, bytes, expiresAt } });
  return { ok: true };
}

/**
 * Libère la réservation d'une clé — l'envoi a abouti (l'objet compte maintenant dans le
 * bucket), ou il a été refusé.
 *
 * Silencieux si la ligne n'existe plus : elle a pu être ramassée entre-temps parce que
 * périmée, et ce n'est pas une erreur pour l'appelant.
 */
export async function releaseStorage(key: string): Promise<void> {
  await prisma.modFileReservation.deleteMany({ where: { key } });
}

/** Retire les réservations périmées. Appelé par le balayage horaire (US-H3). */
export async function purgeExpiredReservations(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.modFileReservation.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return count;
}
