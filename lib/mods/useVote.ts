"use client";

import { useCallback, useRef, useState } from "react";
import type { VoteState } from "./vote";

/** L'état de départ, tel que le serveur l'a rendu avec la fiche. */
export interface VoteInitial {
  /** Total des votes de la fiche, toutes soirées confondues. */
  votes: number;
  /** Votes de la fiche dans la soirée en cours — `0` si elle n'y est pas engagée. */
  soireeVotes: number;
  /** Votes que le membre connecté y a placés — `0`, `1`, ou davantage. */
  myVotes: number;
}

export interface VoteControl {
  votes: number;
  soireeVotes: number;
  myVotes: number;
  /** Au moins une requête est en vol : le bouton l'annonce, sans se bloquer. */
  isPending: boolean;
  /** Message à afficher quand le vote n'est pas passé, `null` sinon. */
  error: string | null;
  /** Poser un vote de plus. L'appelant vérifie la réserve ; le serveur refuse le reste. */
  add: () => void;
  /** Retirer le dernier vote posé. Sans effet quand il n'y en a aucun. */
  remove: () => void;
}

/**
 * US-F1 — les boutons de vote et leur état, partagés par la carte du catalogue, la fiche
 * détail et le classement de la soirée : trois dessins, une seule mécanique.
 *
 * Le compteur bouge avant la réponse du serveur. Voter est l'action la plus banale de
 * l'application, souvent faite depuis un téléphone (cahier §3) : attendre l'aller-retour
 * donnerait un bouton qui ne répond pas au doigt. La réponse remplace ensuite la valeur
 * optimiste par le compte réel — celui des autres membres compris — et un échec défait
 * exactement le pas qui l'a causé, avec un message.
 *
 * L'état local, une fois posé, l'emporte sur les valeurs venues du serveur : la carte
 * survit à un re-rendu du catalogue (changement de tri, de page) sans que le bouton ne
 * retombe une seconde sur l'ancien compte.
 *
 * Trois compteurs, parce qu'un même clic répond à trois questions : la popularité de la
 * fiche (`votes`, ce qu'affichent la carte et la fiche), le score du soir
 * (`soireeVotes`, ce qu'affiche le classement) et ce que ce membre-ci y a mis
 * (`myVotes`, ce qu'affiche l'incrémenteur). Les trois bougent d'un ensemble — c'est le
 * même vote — mais ils ne partent pas du même endroit.
 *
 * `onChange` est prévenu du nouveau `myVotes` à chaque pas, y compris optimiste et y
 * compris quand un échec le défait. La page soirée s'en sert pour tenir sa réserve
 * (8 véhicules, 3 circuits) : le vote vit dans le hook, une ligne du classement, alors
 * que le quota se compte sur toute la soirée. Sans ce signal, les compteurs et les
 * boutons éteints ne bougeraient qu'au rechargement suivant.
 */
export function useVote(
  modId: string,
  initial: VoteInitial,
  onChange?: (myVotes: number) => void,
): VoteControl {
  const [local, setLocal] = useState<VoteState | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Le même état que `local`, lisible sans attendre un re-rendu. Deux clics dans la même
  // image de rendu partagent la closure du premier : sans cette référence, le second
  // repartirait du compte d'avant et écraserait le pas du premier.
  const current = useRef<VoteState | null>(null);
  // Les requêtes se suivent au lieu de partir ensemble : elles écrivent la même réserve,
  // et deux `DELETE` concurrents ne doivent pas viser la même ligne.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Combien de pas attendent encore leur réponse. Sert à ne recopier le compte du
  // serveur que sur la **dernière** — une réponse intermédiaire est déjà en retard sur
  // les clics qui l'ont suivie, et la recopier ferait reculer le compteur sous le doigt.
  const inFlight = useRef(0);

  const votes = local?.votes ?? initial.votes;
  const soireeVotes = local?.soireeVotes ?? initial.soireeVotes;
  const myVotes = local?.myVotes ?? initial.myVotes;

  /** Déplace les trois compteurs d'un pas et rend le nouvel état. */
  const shift = useCallback(
    (delta: 1 | -1): VoteState => {
      const base = current.current ?? {
        modId,
        votes: initial.votes,
        soireeVotes: initial.soireeVotes,
        myVotes: initial.myVotes,
      };
      const next: VoteState = {
        modId,
        // Les bornes basses ne devraient jamais servir — l'appelant n'offre pas de
        // « − » à zéro — mais un compte négatif à l'écran serait pire qu'un pas perdu.
        votes: Math.max(0, base.votes + delta),
        soireeVotes: Math.max(0, base.soireeVotes + delta),
        myVotes: Math.max(0, base.myVotes + delta),
      };

      current.current = next;
      setLocal(next);
      return next;
    },
    [initial.myVotes, initial.soireeVotes, initial.votes, modId],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      // Retirer un vote qu'on n'a pas n'a rien à défaire, et le serveur répondrait le
      // même état : autant ne pas partir.
      const held = current.current?.myVotes ?? initial.myVotes;
      if (delta === -1 && held === 0) return;

      setError(null);
      onChange?.(shift(delta).myVotes);

      inFlight.current += 1;
      setPending((count) => count + 1);

      const undo = (message: string) => {
        onChange?.(shift(delta === 1 ? -1 : 1).myVotes);
        setError(message);
      };

      const run = async () => {
        try {
          // Deux verbes plutôt qu'une bascule côté serveur : le clic dit « un de plus »
          // ou « un de moins », jamais « inverse ce que tu as ». Depuis l'empilement,
          // une bascule n'aurait même plus de sens à exprimer.
          const response = await fetch(`/api/mods/${modId}/vote`, {
            method: delta === 1 ? "POST" : "DELETE",
          });

          if (!response.ok) {
            const body = await response.json().catch(() => null);
            undo(body?.error ?? "Ton vote n'a pas pu être pris en compte.");
            return;
          }

          const state = (await response.json()) as VoteState;
          // Seule la dernière requête en vol a le droit de dire le compte : les autres
          // parlent d'un état que les clics suivants ont déjà dépassé.
          if (inFlight.current === 1) {
            current.current = state;
            setLocal(state);
            onChange?.(state.myVotes);
          }
        } catch {
          undo("Impossible de joindre le serveur. Réessaie dans un instant.");
        } finally {
          inFlight.current -= 1;
          setPending((count) => count - 1);
        }
      };

      queue.current = queue.current.then(run, run);
    },
    [initial.myVotes, modId, onChange, shift],
  );

  const add = useCallback(() => step(1), [step]);
  const remove = useCallback(() => step(-1), [step]);

  return { votes, soireeVotes, myVotes, isPending: pending > 0, error, add, remove };
}
