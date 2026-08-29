"use client";

import { useEffect, useState } from "react";
import { modQueryToSearchParams, type ModListResponse, type ModQuery } from "./query";

export interface CatalogueState {
  /** Dernière réponse reçue, ou `null` tant que la première n'est pas arrivée. */
  data: ModListResponse | null;
  isLoading: boolean;
  /** La requête n'a pas abouti — réseau coupé, session expirée, erreur serveur. */
  hasFailed: boolean;
}

/** Une réponse, avec la requête à laquelle elle répond. */
interface CatalogueResult {
  search: string;
  data: ModListResponse | null;
  hasFailed: boolean;
}

/**
 * US-E1 à US-E4 — le catalogue tel que l'API le renvoie pour une requête donnée.
 *
 * Une requête par état de filtre, annulée dès que l'état change : sans cette
 * annulation, une réponse lente partie sur `drift` pourrait arriver après celle partie
 * sur `drift + jdm` et réafficher la liste large par-dessus la liste étroite.
 *
 * `isLoading` n'est pas un état à part : la réponse retenue porte la requête à laquelle
 * elle répond, et charger, c'est exactement « la dernière réponse ne répond pas à la
 * requête courante ». Un booléen séparé demanderait un `setState` en début d'effet,
 * donc un rendu de plus à chaque frappe.
 *
 * La réponse précédente reste exposée pendant ce temps. C'est ce qui évite que la
 * grille se vide à chaque lettre tapée dans le champ de recherche : les cartes
 * affichées se périment un instant, elles ne disparaissent pas.
 */
export function useModCatalogue(query: ModQuery): CatalogueState {
  // La requête sérialisée, pas l'objet : `parseModQuery` en fabrique un nouveau à
  // chaque rendu, et l'effet se relancerait en boucle sur son identité.
  const search = modQueryToSearchParams(query).toString();
  const [result, setResult] = useState<CatalogueResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(search ? `/api/mods?${search}` : "/api/mods", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`GET /api/mods → ${response.status}`);
        setResult({ search, data: await response.json(), hasFailed: false });
      } catch {
        // Une requête annulée n'est pas un échec : une plus récente est déjà en vol et
        // c'est elle qui écrira le résultat.
        if (controller.signal.aborted) return;
        // La liste précédente est abandonnée plutôt que laissée à l'écran : elle ne
        // correspond plus aux filtres affichés, mieux vaut le message d'erreur.
        setResult({ search, data: null, hasFailed: true });
      }
    })();

    return () => controller.abort();
  }, [search]);

  const settled = result !== null && result.search === search ? result : null;

  return {
    data: result?.data ?? null,
    isLoading: settled === null,
    hasFailed: settled?.hasFailed ?? false,
  };
}
