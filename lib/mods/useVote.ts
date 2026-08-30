"use client";

import { useCallback, useState } from "react";
import type { VoteState } from "./vote";

/** L'état de départ, tel que le serveur l'a rendu avec la fiche. */
export interface VoteInitial {
  /** Total des votes de la fiche, toutes soirées confondues. */
  votes: number;
  /** Votes de la fiche dans la soirée en cours — `0` si elle n'y est pas engagée. */
  soireeVotes: number;
  hasVoted: boolean;
}

export interface VoteControl {
  votes: number;
  soireeVotes: number;
  hasVoted: boolean;
  /** Une requête est en vol : le bouton l'annonce et refuse un second clic. */
  isPending: boolean;
  /** Message à afficher quand le vote n'est pas passé, `null` sinon. */
  error: string | null;
  toggle: () => void;
}

/**
 * US-F1 — le bouton « Voter » et son état, partagés par la carte du catalogue et par
 * la fiche détail : deux dessins, une seule mécanique.
 *
 * Le compteur bouge avant la réponse du serveur. Voter est l'action la plus banale de
 * l'application, souvent faite depuis un téléphone (cahier §3) : attendre l'aller-retour
 * donnerait un bouton qui ne répond pas au doigt. La réponse remplace ensuite la valeur
 * optimiste par le compte réel — celui des autres membres compris — et un échec la
 * remet exactement là où elle était, avec un message.
 *
 * L'état local, une fois posé, l'emporte sur les valeurs venues du serveur : la carte
 * survit à un re-rendu du catalogue (changement de tri, de page) sans que le bouton
 * ne retombe une seconde sur l'ancien compte.
 *
 * Depuis US-G3 le hook suit deux compteurs, parce qu'un même clic répond à deux
 * questions : la popularité de la fiche (`votes`, ce qu'affichent la carte et la fiche)
 * et le score du soir (`soireeVotes`, ce qu'affiche le classement). Les deux bougent de
 * 1 ensemble — c'est le même vote — mais ils ne partent pas du même endroit.
 *
 * Le hook ne sait pas si le mod est votable : c'est à l'appelant de ne pas peindre un
 * bouton actif quand `ApiMod.engagement` est nul. Le serveur refuse de toute façon.
 */
export function useVote(modId: string, initial: VoteInitial): VoteControl {
  const [local, setLocal] = useState<VoteState | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const votes = local?.votes ?? initial.votes;
  const soireeVotes = local?.soireeVotes ?? initial.soireeVotes;
  const hasVoted = local?.hasVoted ?? initial.hasVoted;

  const toggle = useCallback(() => {
    if (isPending) return;

    const previous = local;
    const next = !hasVoted;

    setIsPending(true);
    setError(null);
    const step = next ? 1 : -1;
    setLocal({
      modId,
      votes: Math.max(0, votes + step),
      soireeVotes: Math.max(0, soireeVotes + step),
      hasVoted: next,
    });

    void (async () => {
      try {
        // Deux verbes plutôt qu'une bascule côté serveur : une requête rejouée (réseau
        // capricieux, double clic) redit alors la même chose au lieu d'inverser le vote.
        const response = await fetch(`/api/mods/${modId}/vote`, {
          method: next ? "POST" : "DELETE",
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setLocal(previous);
          setError(body?.error ?? "Ton vote n'a pas pu être pris en compte.");
          return;
        }

        setLocal((await response.json()) as VoteState);
      } catch {
        setLocal(previous);
        setError("Impossible de joindre le serveur. Réessaie dans un instant.");
      } finally {
        setIsPending(false);
      }
    })();
  }, [hasVoted, isPending, local, modId, soireeVotes, votes]);

  return { votes, soireeVotes, hasVoted, isPending, error, toggle };
}
