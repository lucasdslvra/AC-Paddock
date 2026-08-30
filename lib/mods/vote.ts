// Vocabulaire du vote (Epic F), partagé par les routes de vote et par l'interface qui
// les appelle : les deux côtés parlent du même objet, personne ne le retranscrit.

/**
 * L'état du vote pour une fiche, du point de vue du membre connecté — ce que renvoient
 * `POST` et `DELETE /api/mods/[id]/vote` (US-F1), et de quoi peindre le bouton.
 */
export interface VoteState {
  modId: string;
  /** Nombre total de votes sur la fiche, tous membres confondus (US-F2). */
  votes: number;
  /** Vrai si le membre connecté a un vote sur cette fiche. */
  hasVoted: boolean;
}
