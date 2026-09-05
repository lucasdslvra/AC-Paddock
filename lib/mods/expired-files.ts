import "server-only";
import { writeModFileSweep } from "@/lib/admin/config";
import { prisma } from "@/lib/prisma";
import { deleteModFile, modFileKeyFromUrl } from "@/lib/r2/storage";
import { sweepUnretainedModFiles } from "@/lib/soirees/closing";
import { MOD_FILE_TTL_HOURS } from "./file";
import { purgeExpiredReservations } from "./storage-quota";

/**
 * US-H3 / cahier §2.7 — tout fichier déposé saute 24 h après son upload, quelle que
 * soit la date de la soirée à laquelle le mod est associé. La fiche, elle, ne bouge
 * pas : son nom, son lien, sa description, ses votes et son historique restent.
 *
 * Le balayage est déclenché de l'extérieur (pg_cron, voir prisma/sql/), toutes les
 * heures : le cahier insiste sur une fréquence supérieure à la journée, pour que la
 * fenêtre réelle soit « 24 h » et non « 24 h + la période du job ».
 *
 * Il emporte au passage les fichiers qu'aucune soirée ne retient (lib/soirees/closing.ts),
 * qui ont leur propre raison de partir — pas l'âge, mais le classement figé à la
 * fermeture du vote. Ces fichiers-là sont normalement retirés dès la fermeture, par la
 * première lecture du classement ; le balayage est le filet en dessous, pour la soirée
 * que personne n'a rouverte et pour le retrait que Cloudflare avait refusé.
 */

export interface ExpiredFilesSweepResult {
  /** Fiches dont le fichier avait dépassé les 24 h au moment du balayage. */
  expired: number;
  /** Fichiers effectivement retirés du bucket, et fiches remises à zéro. */
  deleted: number;
  /**
   * Fiches laissées en l'état parce que le retrait a échoué. Elles repasseront au
   * balayage suivant : c'est la raison pour laquelle `fileUrl` n'est pas vidé d'office.
   */
  failed: number;
  /**
   * Réservations de place périmées, retirées au passage (US-H1). Sans ce ménage elles
   * s'accumuleraient : une lecture du quota les ignore déjà, mais la table grossirait
   * indéfiniment d'envois abandonnés.
   */
  reservations: number;
  /**
   * Combien, parmi les `deleted`, sont partis non pas parce qu'ils avaient 24 h mais
   * parce qu'aucune soirée ne les retenait (lib/soirees/closing.ts).
   */
  unretained: number;
}

/**
 * Retire du bucket les fichiers arrivés à échéance et vide les colonnes qui les
 * référençaient.
 *
 * L'ordre compte : l'objet part **avant** que la fiche l'oublie. Vider `fileUrl`
 * d'abord laisserait, si le retrait échoue, un objet que plus rien ne désigne — donc
 * que plus aucun balayage ne saurait retrouver, et qui resterait téléchargeable par qui
 * en a gardé l'URL. En cas d'échec on préfère donc réessayer à l'heure suivante ; la
 * fiche affiche « EXPIRÉ » entre-temps (`modFileLifetime`), et ne propose plus le
 * téléchargement.
 */
export async function sweepExpiredModFiles(
  now: Date = new Date(),
): Promise<ExpiredFilesSweepResult> {
  const cutoff = new Date(now.getTime() - MOD_FILE_TTL_HOURS * 3_600_000);

  const expired = await prisma.mod.findMany({
    where: {
      fileUrl: { not: null },
      // Une fiche qui porte un fichier sans date de dépôt est une anomalie — la route
      // d'upload écrit toujours les deux ensemble. On la ramasse quand même : sans
      // horodatage, rien ne la ferait jamais expirer.
      OR: [{ fileUploadedAt: { lt: cutoff } }, { fileUploadedAt: null }],
    },
    select: { id: true, fileUrl: true },
  });

  let deleted = 0;
  let failed = 0;

  for (const mod of expired) {
    const key = mod.fileUrl ? modFileKeyFromUrl(mod.fileUrl) : null;

    try {
      // Une URL qui ne vient pas de notre bucket n'a pas d'objet à retirer : il n'y a
      // que la colonne à nettoyer. `DeleteObject` réussit sur une clé déjà absente,
      // donc un objet retiré à la main ne bloque pas la fiche.
      if (key) await deleteModFile(key);

      await prisma.mod.update({
        where: { id: mod.id },
        data: { fileUrl: null, fileUploadedAt: null },
      });
      deleted += 1;
    } catch (error) {
      // Un échec sur une fiche ne doit pas interrompre le balayage des autres.
      console.error(`Expiration du fichier du mod ${mod.id}`, error);
      failed += 1;
    }
  }

  // Après l'expiration, et non avant : les deux balayages retirent les mêmes objets par
  // des chemins différents, et une fiche déjà remise à zéro ici ne se présentera pas à
  // l'autre.
  const unretained = await sweepUnretainedModFiles(now);

  const result = {
    expired: expired.length,
    // Ce que le bucket a perdu à ce passage, les deux motifs confondus : c'est le
    // chiffre que l'espace admin affiche, et il doit compter tout ce qui est parti.
    deleted: deleted + unretained.deleted,
    failed: failed + unretained.failed,
    reservations: await purgeExpiredReservations(now),
    unretained: unretained.deleted,
  };

  // US-K1 — la trace que l'espace admin affiche. Sans elle, une tâche planifiée qui ne
  // tourne plus ne se voit pas : le panneau annoncerait une rétention de 24 h sans que
  // rien ne la fasse respecter.
  await writeModFileSweep({ at: now.toISOString(), ...result });

  return result;
}
