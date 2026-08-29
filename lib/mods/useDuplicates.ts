"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIN_NAME_QUERY_LENGTH,
  NAME_SEARCH_DEBOUNCE_MS,
  type UrlCheckResult,
} from "./duplicates";
import type { ApiMod } from "./serialize";

/**
 * US-D1 — fiches au nom proche de celui en cours de saisie.
 *
 * Une requête par saisie stabilisée, comme l'autocomplétion des tags (US-C1) : le
 * nettoyage annule la précédente, sans quoi une réponse lente arrivée après une plus
 * récente écraserait la bonne liste.
 *
 * `enabled` vaut faux à l'édition d'une fiche, où elle se trouverait elle-même.
 */
export function useSimilarMods(name: string, enabled: boolean): ApiMod[] {
  const [similar, setSimilar] = useState<ApiMod[]>([]);
  const query = name.trim();
  const isSearching = enabled && query.length >= MIN_NAME_QUERY_LENGTH;

  useEffect(() => {
    if (!isSearching) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/mods/search?name=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        setSimilar(await response.json());
      } catch {
        // Requête annulée ou réseau indisponible : la détection est une aide à la
        // décision (cahier §2.4), son absence ne doit pas gêner la saisie.
      }
    }, NAME_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isSearching]);

  // Le résultat est filtré à la lecture plutôt qu'effacé dans l'effet : repasser sous
  // le seuil, ou effacer le champ, doit vider la liste tout de suite, sans attendre un
  // rendu de plus. La réponse précédente reste affichée pendant la frappe suivante —
  // c'est ce qui évite que la liste clignote à chaque lettre.
  return isSearching ? similar : [];
}

export interface UrlDuplicate {
  /** Fiche portant déjà ce lien, tant que l'avertissement n'a pas été écarté. */
  match: ApiMod | null;
  /** Interroge l'API pour un lien complet — au blur et au collage, pas à la frappe. */
  check: (url: string) => void;
  /** « Créer quand même » : écarte l'avertissement pour ce lien précis (US-D3). */
  dismiss: () => void;
  /** Le lien a changé : l'avertissement affiché ne le concerne plus. */
  reset: () => void;
}

/**
 * US-D2 — vérification du lien externe contre les fiches existantes.
 *
 * Déclenchée par le formulaire au blur et au collage plutôt qu'à la frappe : une URL
 * n'a de sens qu'entière, et un membre colle son lien bien plus souvent qu'il ne le
 * tape. Un même lien n'est interrogé qu'une fois — inutile de refaire l'aller-retour
 * chaque fois que le champ perd le focus.
 */
export function useUrlDuplicate(enabled: boolean): UrlDuplicate {
  const [match, setMatch] = useState<ApiMod | null>(null);
  // Des refs, pas des états : ces valeurs pilotent le déclenchement des requêtes, elles
  // n'ont rien à afficher et ne doivent pas provoquer de rendu.
  const checked = useRef<string | null>(null);
  const dismissed = useRef<string | null>(null);

  const check = useCallback(
    (raw: string) => {
      const url = raw.trim();
      if (!enabled || !url || url === checked.current || url === dismissed.current) return;
      checked.current = url;

      void (async () => {
        try {
          const response = await fetch(`/api/mods/check-url?url=${encodeURIComponent(url)}`);
          if (!response.ok) return;
          const result: UrlCheckResult = await response.json();
          // Le champ a pu changer pendant l'aller-retour : on n'affiche la réponse que
          // si elle porte toujours sur le lien courant.
          if (checked.current === url) setMatch(result.match ?? null);
        } catch {
          // Même parti pris que ci-dessus : pas de message d'erreur pour une aide.
        }
      })();
    },
    [enabled],
  );

  const dismiss = useCallback(() => {
    // Retenir le lien écarté, sinon l'avertissement reviendrait au prochain blur.
    dismissed.current = checked.current;
    setMatch(null);
  }, []);

  const reset = useCallback(() => {
    checked.current = null;
    setMatch(null);
  }, []);

  return { match, check, dismiss, reset };
}
