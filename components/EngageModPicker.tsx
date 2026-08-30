"use client";

import { useEffect, useState } from "react";
import { ModThumbnail } from "@/components/ModThumbnail";
import { TypeBadge } from "@/components/TypeBadge";
import { MAX_SEARCH_LENGTH, SEARCH_DEBOUNCE_MS, type ModListResponse } from "@/lib/mods/query";
import { toUiModType } from "@/lib/mods/type";

interface EngageModPickerProps {
  soireeId: string;
  /** Appelé après un engagement réussi : la page recharge son classement. */
  onEngaged: () => void;
}

/**
 * US-G2 — le sélecteur de mods à associer à une soirée.
 *
 * Le compte affiché est le **cumul** de la fiche, toutes soirées confondues, et non le
 * score du soir — qui vaut zéro pour tout ce qui n'est pas encore engagé. C'est
 * l'information utile au moment de choisir quoi proposer.
 *
 * Il interroge le catalogue plutôt que de tenir sa propre liste : `GET /api/mods` sait
 * déjà chercher par nom (US-E3), et sa réponse porte `engagement`, donc l'information
 * « déjà engagé » sans requête de plus. Une fiche déjà dans la soirée reste affichée,
 * marquée — la faire disparaître laisserait croire qu'elle n'existe pas.
 *
 * Ouvert à tous les membres : le cahier §2.5 dit « les membres associent des mods du
 * catalogue à la soirée », sans le réserver à l'organisateur.
 */
export function EngageModPicker({ soireeId, onEngaged }: EngageModPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ModListResponse | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Même temporisation que le catalogue : passer une requête par caractère saturerait
  // l'API pour un résultat que personne n'a le temps de lire.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ sort: "votes" });
      if (search.trim()) params.set("search", search.trim());

      fetch(`/api/mods?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: ModListResponse | null) => setResults(body))
        .catch(() => {
          // Une requête annulée n'est pas un échec : une plus récente est en vol.
          if (!controller.signal.aborted) setResults(null);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  async function engage(modId: string) {
    setPendingId(modId);
    setError(null);
    try {
      const response = await fetch(`/api/soirees/${soireeId}/mods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modId }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Ce mod n'a pas pu être engagé.");
        return;
      }

      onEngaged();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setPendingId(null);
    }
  }

  // Les fiches déjà engagées descendent en bas de liste : elles restent visibles, mais
  // ne s'intercalent plus entre celles sur lesquelles on peut encore agir.
  const mods = [...(results?.mods ?? [])].sort(
    (a, b) => Number(a.engagement !== null) - Number(b.engagement !== null),
  );

  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
      <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        ENGAGER UN MOD DU CATALOGUE
      </div>

      <div className="mt-[10px] flex items-center gap-2 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[11px] py-[9px]">
        <span className="font-mono text-[11px] text-[var(--color-text-faint)]">⌕</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={MAX_SEARCH_LENGTH}
          placeholder="nom du mod"
          aria-label="Chercher un mod à engager dans la soirée"
          className="w-full bg-transparent font-mono text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 font-mono text-[10.5px] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}

      <div className="mt-[10px] flex max-h-[320px] flex-col overflow-y-auto">
        {mods.length === 0 && (
          <p className="py-3 font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
            {results === null
              ? "Chargement…"
              : search.trim()
                ? "Aucune fiche ne porte ce nom."
                : "Le catalogue est vide — propose un mod d'abord."}
          </p>
        )}
        {mods.map((mod) => {
          const isEngaged = mod.engagement !== null;
          return (
            <div
              key={mod.id}
              className="flex items-center gap-[10px] border-b border-[var(--color-border-hairline)] py-2 last:border-b-0"
            >
              <ModThumbnail src={mod.imageUrl ?? undefined} name={mod.name} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-sans text-[12.5px] font-medium">{mod.name}</div>
                <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                  <TypeBadge type={toUiModType(mod.type)} />
                  {mod.tags.length > 0 && <> · {mod.tags.join(", ")}</>} · {mod.votes} vote
                  {mod.votes > 1 ? "s" : ""} cumulé{mod.votes > 1 ? "s" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void engage(mod.id)}
                disabled={isEngaged || pendingId === mod.id}
                className="btn-solid flex-none rounded-sm px-[10px] py-[6px] font-sans text-[11px] font-medium disabled:cursor-not-allowed"
                style={
                  isEngaged
                    ? { border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }
                    : {
                        background: "var(--color-emphasis-bg)",
                        color: "var(--color-emphasis-text)",
                        opacity: pendingId === mod.id ? 0.6 : 1,
                      }
                }
              >
                {isEngaged ? "✓ engagé" : "Engager"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
