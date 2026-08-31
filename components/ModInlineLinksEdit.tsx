"use client";

import { useState, type FormEvent } from "react";
import { InlineEditActions } from "@/components/InlineEditActions";
import type { ModLink } from "@/lib/mock-data";
import { LINK_LABEL_MAX_LENGTH, MAX_LINKS_PER_MOD } from "@/lib/mods/schema";
import type { ApiMod } from "@/lib/mods/serialize";

interface ModInlineLinksEditProps {
  modId: string;
  /** Les liens secondaires déjà sur la fiche, tels qu'elle les affiche. */
  links: ModLink[];
  /** Un lien retiré : la fiche se réaffiche, le panneau reste ouvert. */
  onChanged: (mod: ApiMod) => void;
  /** Le lien est ajouté : le panneau se referme sur la fiche complétée. */
  onSaved: (mod: ApiMod) => void;
  onCancel: () => void;
}

/**
 * Cahier §2.2 — ajouter un lien secondaire à la fiche (miroir, pack de textures, patch),
 * et retirer ceux qui ne mènent plus nulle part.
 *
 * L'ajout passe par « Enregistrer », le retrait est immédiat : ce sont deux gestes
 * différents, et un retrait mis en attente d'un enregistrement laisserait à l'écran un
 * lien qu'on vient de dire mort.
 *
 * Chaque geste est sa propre requête (`/api/mods/[id]/links`) et la route renvoie la
 * fiche entière : deux membres qui complètent la même fiche en même temps ajoutent
 * chacun leur lien, sans que l'un efface celui de l'autre.
 */
export function ModInlineLinksEdit({
  modId,
  links,
  onChanged,
  onSaved,
  onCancel,
}: ModInlineLinksEditProps) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** L'identifiant du lien en cours de retrait, pour n'éteindre que son bouton. */
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isFull = links.length >= MAX_LINKS_PER_MOD;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/mods/${modId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), url: url.trim() }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        // Le message du champ est plus précis que « Lien invalide ».
        setError(body?.fieldErrors?.url ?? body?.fieldErrors?.label ?? body?.error ?? "Ce lien n'a pas pu être ajouté.");
        return;
      }

      onSaved(body as ApiMod);
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  async function remove(linkId: string) {
    setRemovingId(linkId);
    setError(null);

    try {
      const response = await fetch(`/api/mods/${modId}/links/${linkId}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(body?.error ?? "Ce lien n'a pas pu être retiré.");
        return;
      }

      onChanged(body as ApiMod);
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending) {
          event.preventDefault();
          onCancel();
        }
      }}
      className="mt-[14px] max-w-[520px] border-t border-[var(--color-border-hairline)] pt-[14px]"
    >
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
          AJOUTER UN LIEN SECONDAIRE
        </div>
        <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
          {links.length}/{MAX_LINKS_PER_MOD}
        </div>
      </div>

      {links.length > 0 && (
        <div className="mt-2 flex flex-col rounded-sm border border-[var(--color-border)]">
          {links.map((link) => {
            // Un lien sans identifiant vient des fiches de démonstration : il s'affiche,
            // mais il n'y a rien à retirer en base.
            const linkId = link.id;
            return (
            <div
              key={linkId ?? link.url}
              className="flex items-center gap-3 border-b border-[var(--color-border-hairline)] px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-sans text-[12px] font-medium">{link.label}</div>
                <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                  {link.url}
                  {link.addedBy && ` · ajouté par ${link.addedBy}`}
                </div>
              </div>
              {linkId && (
                <button
                  type="button"
                  onClick={() => void remove(linkId)}
                  disabled={removingId === linkId || isPending}
                  className="btn-outline flex-none rounded-sm border border-[var(--color-border-strong)] px-[8px] py-[5px] font-mono text-[10px] text-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {removingId === linkId ? "…" : "retirer"}
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={LINK_LABEL_MAX_LENGTH}
          disabled={isPending || isFull}
          placeholder="intitulé (facultatif)"
          aria-label="Intitulé du lien"
          className="w-full rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[13px] py-[11px] font-mono text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)] sm:w-[170px]"
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={isPending || isFull}
          placeholder="https://drive.google.com/…"
          aria-label="Adresse du lien"
          className="w-full flex-1 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[13px] py-[11px] font-mono text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>

      <p className="mt-[6px] font-mono text-[10px] leading-[1.5] text-[var(--color-text-muted)]">
        {isFull
          ? "Maximum atteint : retire un lien pour en ajouter un autre."
          : "Sans intitulé, la fiche affiche le domaine du lien. Le lien principal, lui, se modifie à côté. Échap annule."}
      </p>

      <InlineEditActions
        isPending={isPending}
        error={error}
        onCancel={onCancel}
        disabled={isFull || url.trim() === ""}
      />
    </form>
  );
}
