import "server-only";
import { writeModFileSweep } from "@/lib/admin/config";
import { prisma } from "@/lib/prisma";
import { deleteModFiles, listModFileKeys } from "@/lib/r2/storage";

/**
 * US-K1 — le vidage forcé du bucket, depuis l'espace admin.
 *
 * Le balayage horaire (US-H3) ne retire que ce qui a dépassé 24 h ; celui-ci retire
 * tout, quel que soit l'âge. C'est le levier de secours : quand le quota est atteint et
 * qu'on n'attend pas l'expiration, ou quand la tâche planifiée n'a jamais été mise en
 * place et que le bucket s'est rempli.
 *
 * Il porte sur le **bucket**, pas sur les fiches : les objets abandonnés entre la
 * signature d'une URL et sa confirmation n'apparaissent dans aucune colonne, et ce sont
 * eux qu'une reprise en main a le plus besoin d'emporter. Les fiches sont ensuite mises
 * d'accord avec ce qui reste — c'est-à-dire rien.
 *
 * Ce qui n'est pas touché : la fiche elle-même. Nom, lien, description, tags, votes,
 * historique — la même promesse que le cahier §2.7 fait pour l'expiration ordinaire.
 * Vider le bucket fait disparaître des fichiers, jamais du catalogue.
 */

export interface PurgeResult {
  /** Objets trouvés dans le bucket. */
  found: number;
  /** Objets effectivement retirés. */
  deleted: number;
  /** Objets que le bucket a refusé de retirer — ils sont encore là. */
  failed: number;
  /** Fiches dont `fileUrl` a été vidé. */
  cleared: number;
  /** Réservations d'envois en cours annulées. */
  reservations: number;
}

export async function purgeAllModFiles(now: Date = new Date()): Promise<PurgeResult> {
  const keys = await listModFileKeys();
  const failedKeys = keys.length > 0 ? await deleteModFiles(keys) : [];

  // Les fiches sont mises d'accord avec le bucket même si des objets ont résisté :
  // garder un `fileUrl` qui pointe vers un objet supprimé afficherait un bouton de
  // téléchargement mort, ce qui est pire qu'un fichier qu'on sait parti. Les objets
  // récalcitrants sont signalés à l'appelant et ramassés par la règle de cycle de vie.
  const [cleared, reservations] = await prisma.$transaction([
    prisma.mod.updateMany({
      where: { fileUrl: { not: null } },
      data: { fileUrl: null, fileUploadedAt: null },
    }),
    // Les envois en vol n'aboutiront pas : leur objet vient d'être retiré, et la
    // confirmation ne le retrouvera pas. Leur place n'a plus à être retenue.
    prisma.modFileReservation.deleteMany({}),
  ]);

  const result: PurgeResult = {
    found: keys.length,
    deleted: keys.length - failedKeys.length,
    failed: failedKeys.length,
    cleared: cleared.count,
    reservations: reservations.count,
  };

  // Le panneau de l'espace admin lit cette trace : un vidage manuel est un nettoyage,
  // et il doit repousser l'horodatage — sinon la pastille annoncerait « EN RETARD »
  // juste après qu'on a vidé le bucket à la main.
  await writeModFileSweep({
    at: now.toISOString(),
    expired: result.cleared,
    deleted: result.deleted,
    failed: result.failed,
    reservations: result.reservations,
    // Un vidage forcé ne trie pas : il emporte le bucket entier, retenus compris. Rien
    // n'est parti « faute d'être retenu », et l'annoncer serait une raison inventée.
    unretained: 0,
  });

  return result;
}
