"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PurgeFilesButtonProps {
  /** Vrai s'il y a quelque chose à retirer — sinon le bouton n'a rien à faire. */
  hasFiles: boolean;
}

type Phase =
  | { kind: "idle" }
  /** Le bouton a été cliqué une fois : il demande confirmation avant d'agir. */
  | { kind: "confirming" }
  | { kind: "pending" }
  | { kind: "done"; deleted: number; cleared: number; failed: number }
  | { kind: "error"; message: string };

/**
 * US-K1 — le vidage forcé du bucket Cloudflare.
 *
 * Le balayage automatique ne retire que ce qui a dépassé 24 h ; ce bouton retire tout,
 * tout de suite. C'est le levier de secours quand le quota est atteint et qu'on ne veut
 * pas attendre l'expiration — ou quand la tâche planifiée n'a jamais été mise en place.
 *
 * En deux clics, et sans `window.confirm` : le premier clic transforme le bouton en une
 * question qui dit ce qui va disparaître, le second exécute. Une boîte de dialogue
 * native se ferme au clavier par réflexe et ne raconte rien de ce qu'elle emporte.
 */
export function PurgeFilesButton({ hasFiles }: PurgeFilesButtonProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function purge() {
    setPhase({ kind: "pending" });
    try {
      const response = await fetch("/api/admin/storage", { method: "DELETE" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setPhase({ kind: "error", message: body?.error ?? "Le bucket n'a pas pu être vidé." });
        return;
      }

      setPhase({ kind: "done", deleted: body.deleted, cleared: body.cleared, failed: body.failed });
      // La jauge et la ligne « dernier nettoyage » sont rendues côté serveur : c'est la
      // page qu'on redemande, pas un état local qu'il faudrait tenir d'accord avec elle.
      router.refresh();
    } catch {
      setPhase({ kind: "error", message: "Impossible de joindre le serveur." });
    }
  }

  if (phase.kind === "done") {
    return (
      <p className="mt-[10px] font-mono text-[10px] leading-[1.55] text-[var(--color-text-muted)]">
        {phase.deleted === 0
          ? "Rien à retirer : le bucket était déjà vide."
          : `${phase.deleted} fichier${phase.deleted > 1 ? "s" : ""} retiré${phase.deleted > 1 ? "s" : ""}, ${phase.cleared} fiche${phase.cleared > 1 ? "s" : ""} remise${phase.cleared > 1 ? "s" : ""} à zéro.`}
        {phase.failed > 0 && ` ${phase.failed} n'a pas pu être supprimé.`}
      </p>
    );
  }

  if (phase.kind === "confirming") {
    return (
      <div className="mt-[10px]">
        <p className="font-mono text-[10px] leading-[1.55] text-[var(--color-text-secondary)]">
          Tous les fichiers du bucket seront supprimés, y compris ceux déposés il y a
          moins de 24 h et les envois en cours. Les fiches, elles, ne bougent pas.
        </p>
        <div className="mt-2 flex gap-[7px]">
          <button
            type="button"
            onClick={purge}
            className="flex-1 rounded-sm py-[9px] font-sans text-xs font-semibold"
            style={{ background: "var(--color-danger-text)", color: "var(--color-ink)" }}
          >
            Vider définitivement
          </button>
          <button
            type="button"
            onClick={() => setPhase({ kind: "idle" })}
            className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[9px] font-sans text-xs font-medium"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-[10px]">
      <button
        type="button"
        disabled={!hasFiles || phase.kind === "pending"}
        onClick={() => setPhase({ kind: "confirming" })}
        className="btn-outline w-full rounded-sm border border-[var(--color-border-strong)] py-[9px] font-sans text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
      >
        {phase.kind === "pending" ? "Vidage en cours…" : "Vider le bucket maintenant"}
      </button>

      {phase.kind === "error" && (
        <p role="alert" className="mt-2 font-mono text-[10px] leading-[1.5] text-[var(--color-danger-text)]">
          {phase.message}
        </p>
      )}

      {!hasFiles && phase.kind === "idle" && (
        <p className="mt-2 font-mono text-[10px] text-[var(--color-text-faint)]">
          Le bucket est vide — rien à retirer.
        </p>
      )}
    </div>
  );
}
