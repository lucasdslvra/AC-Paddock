"use client";

import { useCallback, useState } from "react";
import type { ModFieldErrors } from "./schema";
import type { ApiMod } from "./serialize";

/**
 * Les champs qu'une retouche depuis la fiche peut envoyer. C'est un sous-ensemble de
 * `modPatchSchema` : le nom et le type ne se corrigent que depuis le formulaire complet,
 * où ils voisinent la détection de doublons (US-D1/D2) qui en dépend.
 *
 * `null` efface — la route lit la présence de la clé, pas sa valeur (`buildModUpdateData`).
 */
export interface ModPatch {
  url?: string;
  description?: string | null;
  imageUrl?: string | null;
  tags?: string[];
}

export interface PatchModControl {
  /** Renvoie la fiche telle que la route l'a réécrite, ou `null` si rien n'est passé. */
  save: (patch: ModPatch) => Promise<ApiMod | null>;
  isPending: boolean;
  /** Message à afficher sous le champ, `null` tant que rien n'a échoué. */
  error: string | null;
}

/**
 * US-B3 — une retouche d'un seul champ, depuis la fiche (`PATCH /api/mods/[id]`).
 *
 * Le corps ne porte que le champ touché : la route laisse intact tout ce qui n'y figure
 * pas. Deux membres qui corrigent l'un la description et l'autre les tags ne s'écrasent
 * donc pas — ce qu'un envoi du formulaire complet ferait.
 */
export function usePatchMod(modId: string): PatchModControl {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: ModPatch): Promise<ApiMod | null> => {
      setIsPending(true);
      setError(null);

      try {
        const response = await fetch(`/api/mods/${modId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          // Le message du champ édité dit ce qui cloche (« Entre un lien valide… ») ;
          // le message global, lui, ne dirait que « Formulaire invalide ».
          const fieldErrors: ModFieldErrors = body?.fieldErrors ?? {};
          const detail = Object.keys(patch)
            .map((field) => fieldErrors[field as keyof ModFieldErrors])
            .find(Boolean);
          setError(detail ?? body?.error ?? "La fiche n'a pas pu être enregistrée.");
          return null;
        }

        return body as ApiMod;
      } catch {
        setError("Impossible de joindre le serveur. Réessaie dans un instant.");
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [modId],
  );

  return { save, isPending, error };
}
