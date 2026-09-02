"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface EngageModButtonProps {
  modId: string;
  /** La soirée en cours, ou `null` s'il n'y en a aucune de programmée. */
  soiree: { id: string; dateLabel: string } | null;
  /** Vrai si la fiche est déjà engagée dans cette soirée (`ApiMod.engagement`). */
  isEngaged: boolean;
  /**
   * Pourquoi la soirée n'accepte plus d'engagement — son vote a fermé 30 min avant le
   * départ, et l'engagement se ferme avec lui. `null` tant qu'elle en accepte.
   */
  closedReason?: string | null;
}

/**
 * US-G2 — engager cette fiche dans la soirée en cours, depuis la fiche elle-même.
 *
 * Le sélecteur de la page soirée (`EngageModPicker`) part de la soirée et cherche un
 * mod ; ici on part du mod, qui est déjà sous les yeux. Même route, même règle : tout
 * membre peut engager, et seule la soirée en cours accepte des engagements.
 *
 * Une fois engagée, la fiche ne propose pas de se retirer : le retrait emporte les
 * votes reçus, et il est réservé à celui qui a engagé le mod ou à un admin (cahier §2.6)
 * — deux choses que la fiche ne sait pas dire. Elle renvoie donc au classement, où la
 * ligne porte son bouton « retirer » et le nom de celui qui a engagé.
 */
export function EngageModButton({
  modId,
  soiree,
  isEngaged,
  closedReason = null,
}: EngageModButtonProps) {
  const router = useRouter();
  // L'engagement qui vient d'être fait : le `router.refresh()` rapportera la même chose,
  // mais plus tard, et le bouton ne doit pas rester « à engager » entre-temps.
  const [justEngaged, setJustEngaged] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engaged = isEngaged || justEngaged;

  async function engage() {
    if (!soiree || isPending) return;

    setIsPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/soirees/${soiree.id}/mods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Ce mod n'a pas pu être engagé.");
        return;
      }

      setJustEngaged(true);
      // La fiche devient votable (US-G3) : c'est le serveur qui peint le panneau de
      // vote, il faut donc le refaire passer plutôt que de deviner ici son état.
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  if (!soiree) {
    return (
      <span className="rounded-sm border border-dashed border-[var(--color-border-dashed)] px-3 py-[9px] text-center font-mono text-[10.5px] leading-[1.5] text-[var(--color-text-muted)]">
        Aucune soirée programmée — rien où engager cette fiche pour l&apos;instant.
      </span>
    );
  }

  // Le classement est figé : engager maintenant ajouterait une ligne que personne ne
  // pourra voter. La fiche déjà engagée, elle, garde son lien vers le classement.
  if (closedReason && !engaged) {
    return (
      <span className="rounded-sm border border-dashed border-[var(--color-border-dashed)] px-3 py-[9px] text-center font-mono text-[10.5px] leading-[1.5] text-[var(--color-text-muted)]">
        {closedReason}
      </span>
    );
  }

  if (engaged) {
    return (
      <Link
        href="/soiree"
        className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-3 py-[9px] text-center font-sans text-xs font-medium"
        style={{ borderColor: "var(--color-amber)" }}
      >
        ✓ Engagé dans la soirée du {soiree.dateLabel} — voir le classement
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void engage()}
        disabled={isPending}
        aria-busy={isPending}
        className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-3 py-[9px] font-sans text-xs font-medium disabled:opacity-60"
      >
        {isPending ? "Engagement…" : `Engager dans la soirée du ${soiree.dateLabel}`}
      </button>
      {error && (
        <p role="alert" className="font-mono text-[10px] leading-[1.5] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </>
  );
}
