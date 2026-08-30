"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface DeleteModButtonProps {
  modId: string;
  modName: string;
}

/** Suppression d'une fiche (US-B4), avec confirmation — l'action est irréversible. */
export function DeleteModButton({ modId, modName }: DeleteModButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Échap ferme la modale, sauf pendant la suppression : la requête est déjà partie.
  useEffect(() => {
    if (!isOpen) return;
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleting) setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isDeleting]);

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/mods/${modId}`, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "La fiche n'a pas pu être supprimée.");
        setIsDeleting(false);
        return;
      }

      // La fiche n'existe plus : `refresh` vide le cache du routeur, sinon le retour
      // arrière la réafficherait.
      router.replace("/catalogue");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn-danger rounded-sm px-3 py-[9px] font-sans text-xs font-medium"
        style={{ border: "1px solid var(--color-danger)", color: "var(--color-danger-text)" }}
      >
        Supprimer la fiche
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={() => {
            if (!isDeleting) setIsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="supprimer-fiche-titre"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[420px] rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5"
          >
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              SUPPRESSION DÉFINITIVE
            </div>
            <h2 id="supprimer-fiche-titre" className="mt-2 text-pretty font-sans text-lg font-bold leading-tight">
              Supprimer « {modName} » ?
            </h2>
            <p className="mt-2 font-sans text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
              La fiche, son image et les contributions qu&apos;elle a reçues seront perdues.
              Cette action ne peut pas être annulée.
            </p>

            {error && (
              <p
                className="mt-3 rounded-sm border px-3 py-2 font-sans text-xs"
                style={{ borderColor: "var(--color-danger)", color: "var(--color-danger-text)" }}
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isDeleting}
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[13px] py-2 font-sans text-xs font-medium disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="btn-solid rounded-sm px-[14px] py-2 font-sans text-xs font-semibold disabled:opacity-60"
                style={{ background: "var(--color-danger)", color: "#fff" }}
              >
                {isDeleting ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
