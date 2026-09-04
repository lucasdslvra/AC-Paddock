"use client";

import { useCallback, useEffect, useState } from "react";
import { modQueryToSearchParams, type ModListResponse, type ModQuery } from "./query";
import type { ApiMod } from "./serialize";

export interface CatalogueState {
  /**
   * La dernière réponse reçue — total, compteurs par type, soirée en cours. Ses `mods`
   * ne sont que ceux de la dernière page : la liste à afficher est `mods`, ci-dessous.
   * `null` tant que la toute première réponse n'est pas arrivée.
   */
  data: ModListResponse | null;
  /** Les fiches chargées jusqu'ici, pages successives mises bout à bout. */
  mods: ApiMod[];
  /** Vrai tant que la **première** page des filtres courants n'est pas là. */
  isLoading: boolean;
  /** Vrai pendant qu'une page suivante arrive : ce qui est affiché, lui, ne bouge pas. */
  isLoadingMore: boolean;
  /** Reste-t-il des fiches à charger pour les filtres courants ? */
  hasMore: boolean;
  /** Charge la page suivante. Sans effet si une page est déjà en vol, ou si c'est fini. */
  loadMore: () => void;
  /** La requête n'a pas abouti — réseau coupé, session expirée, erreur serveur. */
  hasFailed: boolean;
  /** Relance la page qui a échoué, sans rien perdre de ce qui est déjà affiché. */
  retry: () => void;
}

/** Ce que le hook empile pour une signature de filtres donnée. */
interface Accumulator {
  /** Les filtres sérialisés (page exclue) que la pile est en train de servir. */
  filters: string;
  /** La page demandée — en vol tant que `loadedPage` ne l'a pas rejointe. */
  page: number;
  /**
   * La dernière page reçue **pour ces filtres**. `0` : aucune encore — `mods` et `data`
   * sont alors ceux des filtres précédents, périmés mais affichés le temps que la
   * première réponse arrive.
   */
  loadedPage: number;
  mods: ApiMod[];
  data: ModListResponse | null;
  hasFailed: boolean;
  /** Compteur de reprises : c'est lui qui fait rejouer l'effet après un échec. */
  attempt: number;
}

const FIRST_PAGE = 1;

/**
 * L'état de départ pour de nouveaux filtres. La liste précédente est conservée le temps
 * de la première réponse : c'est ce qui évite que la grille se vide à chaque lettre
 * tapée dans le champ de recherche — les cartes affichées se périment un instant, elles
 * ne disparaissent pas.
 */
function restartOn(filters: string, previous?: Accumulator): Accumulator {
  return {
    filters,
    page: FIRST_PAGE,
    loadedPage: 0,
    mods: previous?.mods ?? [],
    data: previous?.data ?? null,
    hasFailed: false,
    attempt: 0,
  };
}

/**
 * US-E1 à US-E4 — le catalogue tel que l'API le renvoie, en défilement continu.
 *
 * L'API reste paginée (`MODS_PER_PAGE` par appel) : c'est ici que les pages se
 * recollent. La liste ne se remplace donc pas d'une page à l'autre, elle s'allonge —
 * et un changement de filtre repart de zéro, parce que les fiches empilées répondaient
 * à une autre question.
 *
 * Une requête à la fois, annulée dès que l'état change : sans cette annulation, une
 * réponse lente partie sur `drift` pourrait arriver après celle partie sur
 * `drift + jdm` et réafficher la liste large par-dessus la liste étroite.
 *
 * `isLoading` n'est pas un état à part : il se lit de la pile elle-même — charger,
 * c'est « la page demandée n'est pas encore reçue ». Un booléen séparé demanderait un
 * `setState` en début d'effet, donc un rendu de plus à chaque frappe.
 *
 * La page inscrite dans l'URL (`?page=3`) est ignorée : en défilement continu, entrer
 * au milieu de la liste laisserait tout ce qui précède inaccessible.
 */
export function useModCatalogue(query: ModQuery): CatalogueState {
  // La signature des filtres, page exclue : c'est en changeant qu'elle remet la pile à
  // zéro. Une chaîne, pas l'objet : `parseModQuery` en fabrique un nouveau à chaque
  // rendu, et l'effet se relancerait en boucle sur son identité.
  const filters = modQueryToSearchParams({ ...query, page: FIRST_PAGE }).toString();

  const [state, setState] = useState<Accumulator>(() => restartOn(filters));

  // Les filtres ont changé : on repart de la première page, pendant le rendu et non
  // dans un effet. Un effet aurait laissé le rendu intermédiaire lancer la requête de
  // la page 4 des *nouveaux* filtres — une page que personne n'a demandée.
  if (state.filters !== filters) setState((current) => restartOn(filters, current));

  const { page, attempt } = state;

  useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams(filters);
    if (page > FIRST_PAGE) search.set("page", String(page));
    const queryString = search.toString();
    const url = queryString ? `/api/mods?${queryString}` : "/api/mods";

    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`GET /api/mods → ${response.status}`);
        const body: ModListResponse = await response.json();

        setState((current) => {
          // La réponse d'un état déjà quitté : elle ne répond plus à la question posée.
          if (current.filters !== filters || current.page !== page) return current;
          return {
            ...current,
            loadedPage: page,
            data: body,
            // La première page remplace, les suivantes s'ajoutent : c'est toute la
            // différence entre paginer et dérouler.
            mods: page === FIRST_PAGE ? body.mods : [...current.mods, ...body.mods],
            hasFailed: false,
          };
        });
      } catch {
        // Une requête annulée n'est pas un échec : une plus récente est déjà en vol et
        // c'est elle qui écrira le résultat.
        if (controller.signal.aborted) return;
        setState((current) => {
          if (current.filters !== filters || current.page !== page) return current;
          // Une page suivante qui échoue ne coûte que sa page : ce qui est déjà déroulé
          // reste à l'écran, avec de quoi réessayer. La première, elle, n'a rien à
          // garder — la liste encore affichée est celle des filtres d'avant, et elle ne
          // correspond plus à ce que la colonne de gauche annonce.
          const isFirst = page === FIRST_PAGE;
          return {
            ...current,
            hasFailed: true,
            ...(isFirst && { data: null, mods: [] }),
          };
        });
      }
    })();

    return () => controller.abort();
    // `attempt` n'est pas lu ici : il ne sert qu'à faire rejouer l'effet après un échec.
  }, [filters, page, attempt]);

  const loadMore = useCallback(() => {
    setState((current) => {
      // Une page déjà en vol, un échec à reprendre d'abord, ou plus rien à charger :
      // l'observateur du bas de liste appelle sans discernement, c'est ici que ça se
      // décide. `loadedPage` à 0 vaut « la première page des filtres courants n'est pas
      // là » — ce qui est déroulé à l'écran appartient encore aux filtres d'avant.
      if (current.data === null || current.hasFailed) return current;
      if (current.loadedPage === 0 || current.loadedPage !== current.page) return current;
      if (current.page >= current.data.pageCount) return current;
      return { ...current, page: current.page + 1 };
    });
  }, []);

  const retry = useCallback(() => {
    setState((current) =>
      current.hasFailed ? { ...current, hasFailed: false, attempt: current.attempt + 1 } : current,
    );
  }, []);

  const isFresh = state.loadedPage > 0;

  return {
    data: state.data,
    mods: state.mods,
    isLoading: !isFresh && !state.hasFailed,
    isLoadingMore: isFresh && state.loadedPage < state.page && !state.hasFailed,
    hasMore: state.data !== null && isFresh && state.loadedPage < state.data.pageCount,
    loadMore,
    hasFailed: state.hasFailed,
    retry,
  };
}
