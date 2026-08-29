// Constantes et formes de réponse de la détection de doublons (cahier §2.4, Epic D).
// Module volontairement neutre : il est importé aussi bien par les routes API
// (app/api/mods/search, app/api/mods/check-url) que par les hooks du formulaire.

import type { ApiMod } from "./serialize";

/**
 * En dessous, la recherche floue ne veut rien dire : deux caractères se ressemblent
 * partout, et la liste proposerait la moitié du catalogue.
 */
export const MIN_NAME_QUERY_LENGTH = 3;

/** Assez de fiches proches pour lever le doute, assez peu pour rester lisible. */
export const SIMILAR_MODS_LIMIT = 5;

/**
 * Temps d'inactivité avant d'interroger l'API pendant la saisie du nom. Assez court
 * pour que la liste suive la frappe, assez long pour ne pas lancer une requête par
 * lettre — même compromis que l'autocomplétion des tags (US-C1).
 */
export const NAME_SEARCH_DEBOUNCE_MS = 250;

/** Réponse de `GET /api/mods/check-url` : la fiche qui porte déjà ce lien, ou rien. */
export interface UrlCheckResult {
  match: ApiMod | null;
}
