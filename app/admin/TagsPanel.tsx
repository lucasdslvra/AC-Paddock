"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModerationList } from "@/lib/admin/moderation";
import type { AdminTagRow } from "@/lib/admin/settings";

/**
 * US-K2 — la modération du vocabulaire.
 *
 * Le vocabulaire est alimenté librement par les membres (cahier §2.2) : il accumule des
 * fautes de frappe et des variantes que l'autocomplétion (US-C1) recopie ensuite de
 * fiche en fiche. Les retirer est réservé à l'admin, comme toute suppression de contenu
 * qui ne nous appartient pas.
 *
 * Les tags les plus utilisés sont en tête, les orphelins en bas : c'est là que sont
 * presque toujours les variantes à supprimer.
 */
export function TagsPanel({ tags }: { tags: ModerationList<AdminTagRow> }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(name: string) {
    setError(null);
    setDeleting(name);

    try {
      const response = await fetch(`/api/tags/${encodeURIComponent(name)}`, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Le tag n'a pas pu être supprimé.");
        return;
      }

      setPending(null);
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        VOCABULAIRE · {tags.total}
      </div>

      {error && (
        <p role="alert" className="mt-2 font-mono text-[10.5px] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}

      <div className="mt-[11px] flex flex-col gap-[6px]">
        {tags.rows.length === 0 && (
          <p className="font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
            Aucun tag pour l&apos;instant : ils apparaissent au fil des fiches.
          </p>
        )}

        {tags.rows.map((tag) => (
          <div key={tag.name} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{tag.name}</span>
            <span className="flex-none font-mono text-[10px] text-[var(--color-text-muted)]">
              {tag.modCount} fiche{tag.modCount > 1 ? "s" : ""}
            </span>
            {pending === tag.name ? (
              <span className="flex flex-none gap-1">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={deleting === tag.name}
                  className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[6px] py-[2px] font-mono text-[10px] disabled:opacity-60"
                >
                  non
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tag.name)}
                  disabled={deleting === tag.name}
                  className="btn-solid rounded-sm px-[6px] py-[2px] font-mono text-[10px] disabled:opacity-60"
                  style={{ background: "var(--color-danger)", color: "#fff" }}
                >
                  {deleting === tag.name ? "…" : "oui"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPending(tag.name);
                }}
                aria-label={`Supprimer le tag ${tag.name}`}
                title={`Supprimer le tag ${tag.name}`}
                className="btn-danger flex-none rounded-sm px-[6px] py-[2px] font-mono text-[11px] leading-none"
                style={{ border: "1px solid var(--color-border-strong)", color: "var(--color-text-muted)" }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {tags.total > tags.rows.length && (
          <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
            + {tags.total - tags.rows.length} autres
          </div>
        )}
      </div>
    </div>
  );
}
