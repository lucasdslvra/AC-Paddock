// Vocabulaire du vote (Epic F, repris par US-G3), partagé par les routes de vote et par
// l'interface qui les appelle : les deux côtés parlent du même objet, personne ne le
// retranscrit.

/**
 * L'état du vote pour une fiche, du point de vue du membre connecté — ce que renvoient
 * les routes de vote, et de quoi peindre le bouton.
 *
 * Deux compteurs, parce que deux écrans posent deux questions différentes sur le même
 * clic : la carte du catalogue et la fiche affichent la popularité de la fiche
 * (`votes`), la page soirée affiche le classement du soir (`soireeVotes`). Un seul
 * chiffre aurait obligé l'un des deux à mentir.
 */
export interface VoteState {
  modId: string;
  /** Total des votes de la fiche, toutes soirées confondues (US-F2, tri US-E4). */
  votes: number;
  /**
   * Votes de cette fiche dans la soirée où le vote vient d'être écrit (US-G4).
   * `0` quand le mod n'est engagé nulle part — il n'est alors pas votable.
   */
  soireeVotes: number;
  /** Vrai si le membre connecté a un vote sur ce mod dans la soirée en cours. */
  hasVoted: boolean;
}

/**
 * US-G3 — pourquoi un bouton de vote est éteint. Le cas n'est pas rare : hors soirée,
 * *aucun* mod n'est votable, et il faut le dire plutôt que d'afficher un bouton mort.
 *
 * Trois raisons, dans cet ordre : il n'y a pas de soirée ; il y en a une mais son vote a
 * fermé (30 min avant le départ, `voteClosedMessage`) ; le mod n'y est pas engagé. La
 * fermeture passe devant l'engagement parce qu'engager n'y changerait plus rien —
 * l'inverse enverrait le membre garnir une liste close.
 */
export function voteDisabledReason(
  hasCurrentSoiree: boolean,
  /** La phrase de `voteClosedMessage` quand le vote du soir a fermé, `null` sinon. */
  voteClosedReason?: string | null,
): string {
  if (!hasCurrentSoiree) {
    return "Aucune soirée n'est programmée : le vote rouvrira avec la prochaine.";
  }
  return voteClosedReason ?? "Ce mod n'est pas engagé dans la soirée en cours.";
}
