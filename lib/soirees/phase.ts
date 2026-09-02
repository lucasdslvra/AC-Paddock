import { formatSoireeTime } from "./format";

/**
 * Les trois moments d'une soirée, autour de son heure de départ.
 *
 * Le vote ne peut pas rester ouvert jusqu'au départ : à un moment, il faut arrêter le
 * classement pour que chacun ait le temps d'installer ce qui a été retenu. Le vote ferme
 * donc **30 minutes avant** l'heure de la soirée, et c'est exactement là que s'ouvre le
 * retrait des fichiers — un seul basculement, pas deux réglages qui pourraient se
 * croiser : ce qui n'est plus votable est téléchargeable.
 *
 * Le retrait reste ouvert **2 heures après** le départ, pour les retardataires et pour
 * celui dont l'installation a raté : la soirée est commencée, mais elle n'est pas finie.
 *
 *     … vote ouvert …┃ 30 min ┃ ── départ ── 2 h ──┃ … archive …
 *                    ▲                             ▲
 *              vote clos,                    retrait clos
 *            retrait ouvert
 *
 * Des constantes comme les quotas ([lib/soirees/quota.ts](quota.ts)) : ce sont les
 * règles du soir, pas un paramètre d'exploitation. Partagé serveur et client — la route
 * refuse le vote de la 29ᵉ minute, la page fait apparaître le bouton au même instant.
 */
export const VOTE_CLOSES_BEFORE_MS = 30 * 60_000;

/** Combien de temps le retrait reste ouvert après l'heure de départ. */
export const DOWNLOAD_OPEN_AFTER_MS = 2 * 60 * 60_000;

/**
 * Où en est une soirée :
 *
 *   · `OPEN` — on vote, on engage. Le retrait n'a pas encore de sens : le classement
 *     peut encore changer, et un fichier retiré maintenant serait peut-être le mauvais.
 *   · `LOCKED` — le classement est figé, les mods retenus se téléchargent.
 *   · `OVER` — la soirée est jouée. Elle ne se lit plus que comme un compte rendu, et
 *     les fichiers ont de toute façon 24 h à vivre (cahier §2.7).
 */
export type SoireePhase = "OPEN" | "LOCKED" | "OVER";

/** L'instant où le vote ferme : 30 minutes avant le départ. */
export function voteClosesAt(date: Date): Date {
  return new Date(date.getTime() - VOTE_CLOSES_BEFORE_MS);
}

/** L'instant où le retrait ferme : 2 heures après le départ. */
export function downloadClosesAt(date: Date): Date {
  return new Date(date.getTime() + DOWNLOAD_OPEN_AFTER_MS);
}

export function soireePhase(date: Date, now: Date = new Date()): SoireePhase {
  if (now < voteClosesAt(date)) return "OPEN";
  return now < downloadClosesAt(date) ? "LOCKED" : "OVER";
}

/**
 * Le vote est-il ouvert sur cette soirée ?
 *
 * Ne dit rien de *quelle* soirée il s'agit : c'est aux routes de vérifier d'abord qu'on
 * vote bien dans la soirée en cours (`currentSoiree`). Une soirée programmée dans trois
 * semaines est « ouverte » au sens de cette fonction, et refusée au sens de l'autre.
 */
export function isVoteOpen(date: Date, now?: Date): boolean {
  return soireePhase(date, now) === "OPEN";
}

/** La fenêtre de retrait : de la fermeture du vote à deux heures après le départ. */
export function isDownloadOpen(date: Date, now?: Date): boolean {
  return soireePhase(date, now) === "LOCKED";
}

/**
 * Le refus opposé au vote arrivé trop tard, et la phrase affichée à la place du bouton :
 * la même des deux côtés, comme `quotaReachedMessage`.
 *
 * Elle donne l'heure plutôt que « c'est fermé » : quelqu'un qui arrive à 20 h 35 doit
 * comprendre qu'il a manqué la fermeture de cinq minutes, pas croire à une panne.
 */
export function voteClosedMessage(date: Date): string {
  return `Le vote a fermé à ${formatSoireeTime(voteClosesAt(date))}, 30 minutes avant le départ : le classement est figé.`;
}
