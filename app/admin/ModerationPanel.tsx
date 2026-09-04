"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ModThumbnail } from "@/components/ModThumbnail";
import type { AdminModRow } from "@/lib/admin/settings";
import { formatCreatedAt } from "@/lib/mods/format";
import type { ModerationList } from "@/lib/admin/moderation";

interface ModerationPanelProps {
  mods: ModerationList<AdminModRow>;
  tagCount: number;
}

/**
 * US-K2 — le tableau de modération : les dernières fiches créées, et de quoi en
 * supprimer n'importe laquelle.
 *
 * La suppression passe par `DELETE /api/mods/[id]`, la route de US-B4 : c'est déjà
 * elle qui autorise l'auteur **ou** un admin, il n'y avait aucune route à créer. Elle
 * inscrit aussi la suppression au journal, affiché juste en dessous.
 *
 * La confirmation est en place, à même la ligne, plutôt que dans une modale comme sur
 * la fiche (`DeleteModButton`) : ici on en supprime plusieurs à la suite, et une modale
 * à ouvrir et fermer à chaque fois ferait perdre de vue la liste qu'on est en train de
 * trier.
 */
export function ModerationPanel({ mods, tagCount }: ModerationPanelProps) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le filtre travaille sur ce que la page a déjà chargé, sans repasser par l'API : la
  // liste est bornée (`MODERATION_MOD_LIMIT`), et une recherche sur tout le catalogue
  // est exactement ce que fait le catalogue (US-E3).
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return mods.rows;
    return mods.rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) || row.author.toLowerCase().includes(needle),
    );
  }, [filter, mods.rows]);

  async function handleDelete(row: AdminModRow) {
    setError(null);
    setDeletingId(row.id);

    try {
      const response = await fetch(`/api/mods/${row.id}`, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "La fiche n'a pas pu être supprimée.");
        return;
      }

      setPendingId(null);
      // Le tableau, le journal et les compteurs viennent tous de la page serveur :
      // c'est elle qu'on recharge, pas la ligne qu'on retire de son côté.
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 sm:px-[18px] sm:py-[15px]">
        <div>
          <div className="font-sans text-[15px] font-semibold">Modération du catalogue</div>
          <div className="mt-[2px] font-mono text-[9.5px] text-[var(--color-text-muted)]">
            {mods.total} fiche{mods.total > 1 ? "s" : ""} · {tagCount} tag
            {tagCount > 1 ? "s" : ""} · suppression possible sur tout contenu
          </div>
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-[var(--color-border-strong)] px-[10px] py-[7px] sm:flex-none">
          <span aria-hidden className="font-mono text-[10px] text-[var(--color-text-faint)]">
            ⌕
          </span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="filtrer"
            aria-label="Filtrer les fiches par nom ou auteur"
            className="w-full min-w-0 bg-transparent font-mono text-[11px] sm:w-[120px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="border-b border-[var(--color-border-hairline)] px-[18px] py-[9px] font-mono text-[10.5px]"
          style={{ color: "var(--color-danger-text)" }}
        >
          {error}
        </p>
      )}

      {/* Les en-têtes de colonnes ne survivent pas au repli des lignes en cartes :
          sous `md`, chaque valeur se donne son propre libellé. */}
      <div className="hidden grid-cols-[1fr_110px_92px_78px_140px] gap-[14px] border-b border-[var(--color-border-hairline)] px-[18px] py-[9px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)] md:grid">
        <span>FICHE</span>
        <span>AUTEUR</span>
        <span>CRÉÉE</span>
        <span>VOTES</span>
        <span className="text-right">ACTION</span>
      </div>

      {rows.length === 0 && (
        <p className="px-[18px] py-[14px] font-mono text-[10.5px] text-[var(--color-text-muted)]">
          {mods.total === 0
            ? "Le catalogue est vide."
            : "Aucune fiche ne correspond à ce filtre."}
        </p>
      )}

      {rows.map((row) => {
        const isPending = pendingId === row.id;
        const isDeleting = deletingId === row.id;

        return (
          <div
            key={row.id}
            className="grid grid-cols-1 gap-[9px] border-b border-[var(--color-border-hairline)] px-4 py-3 last:border-b-0 md:grid-cols-[1fr_110px_92px_78px_140px] md:items-center md:gap-[14px] md:px-[18px] md:py-[11px]"
          >
            <div className="flex min-w-0 items-center gap-[10px]">
              <ModThumbnail src={row.imageUrl ?? undefined} name={row.name} size={28} />
              <div className="min-w-0">
                <Link
                  href={`/mods/${row.id}`}
                  className="block truncate font-sans text-[13px] font-medium hover:underline"
                >
                  {row.name}
                </Link>
                {/* US-D2 — le doublon que la création laisse passer volontairement
                    (cahier §2.4) : c'est ici qu'on le tranche. */}
                {row.duplicates > 0 && (
                  <div className="font-mono text-[10px]" style={{ color: "var(--color-danger-text)" }}>
                    même lien que {row.duplicates} autre{row.duplicates > 1 ? "s" : ""} fiche
                    {row.duplicates > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
            {/* Trois colonnes sur un écran large ; sur un téléphone, une seule ligne de
                métadonnées sous le nom — empilées, elles feraient trois fois la hauteur
                de la fiche qu'elles décrivent. `md:contents` rend ce conteneur
                transparent pour la grille, qui retrouve alors ses colonnes. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 md:contents">
              <span className="truncate font-mono text-[10.5px] text-[var(--color-text-secondary)]">
                {row.author}
              </span>
              <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
                {formatCreatedAt(new Date(row.createdAt))}
              </span>
              <span className="font-mono text-xs">
                {row.votes}
                <span className="md:hidden"> vote{row.votes > 1 ? "s" : ""}</span>
              </span>
            </div>

            <div className="flex justify-end gap-[6px]">
              {isPending ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPendingId(null)}
                    disabled={isDeleting}
                    className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[9px] py-[6px] font-sans text-[11px] font-medium disabled:opacity-60"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    disabled={isDeleting}
                    className="btn-solid rounded-sm px-[10px] py-[6px] font-sans text-[11px] font-semibold disabled:opacity-60"
                    style={{ background: "var(--color-danger)", color: "#fff" }}
                  >
                    {isDeleting ? "…" : "Confirmer"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPendingId(row.id);
                  }}
                  className="btn-danger rounded-sm px-[10px] py-[6px] font-sans text-[11px] font-medium"
                  style={{ border: "1px solid var(--color-danger)", color: "var(--color-danger-text)" }}
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        );
      })}

      {rows.length > 0 && mods.total > mods.rows.length && (
        <p className="px-[18px] py-[9px] font-mono text-[10px] text-[var(--color-text-muted)]">
          {mods.rows.length} fiches les plus récentes sur {mods.total} · les plus anciennes se
          suppriment depuis leur fiche
        </p>
      )}
    </div>
  );
}
