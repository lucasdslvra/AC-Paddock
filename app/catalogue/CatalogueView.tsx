"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ModCard } from "@/components/ModCard";
import { TagPill } from "@/components/TagPill";
import type { ModType } from "@/lib/generated/prisma/enums";
import {
  MAX_SEARCH_LENGTH,
  MOD_SORTS,
  modQueryToSearchParams,
  parseModQuery,
  SEARCH_DEBOUNCE_MS,
  type ModQuery,
  type ModSort,
} from "@/lib/mods/query";
import { useModCatalogue } from "@/lib/mods/useCatalogue";
import { apiModToView } from "@/lib/mods/view";
import { siteStats } from "@/lib/mock-data";
import { formatSoireeDate } from "@/lib/soirees/format";
import { useRequireAuth } from "@/lib/useRequireAuth";

interface AvailableTag {
  name: string;
  count: number;
}

/** US-E2 — le vocabulaire du cahier §4 (car/track) reste en coulisse (lib/mods/type.ts). */
const TYPE_FILTERS: { key: ModType | null; label: string }[] = [
  { key: null, label: "Tous" },
  { key: "CAR", label: "Véhicules" },
  { key: "TRACK", label: "Circuits" },
];

/** US-E4 — les deux tris du cahier §2.3, sous les mots de l'interface. */
const SORT_LABELS: Record<ModSort, string> = {
  date: "date d'ajout",
  votes: "votes",
};

export function CatalogueView() {
  const { session, isLoading: isAuthLoading } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [knownTags, setKnownTags] = useState<AvailableTag[]>([]);

  // L'URL est la seule source de vérité des filtres, pas un état local : un lien
  // `/catalogue?tags=drift,jdm&type=CAR&sort=votes` arrive donc déjà filtré, la
  // sélection survit à un rechargement, et une pastille cliquée depuis une fiche de mod
  // atterrit juste. C'est le même analyseur que celui de GET /api/mods (US-E1).
  const query = useMemo(() => parseModQuery(searchParams), [searchParams]);

  const updateQuery = useCallback(
    (patch: Partial<ModQuery>, options?: { scroll?: boolean }) => {
      // Tout changement de filtre ramène en page 1 : rester en page 4 après avoir coché
      // un tag afficherait une page vide alors que des résultats existent. Un patch qui
      // porte `page` écrase évidemment cette remise à zéro.
      const next: ModQuery = { ...query, page: 1, ...patch };
      const params = modQueryToSearchParams(next).toString();

      // `replace` plutôt que `push` : cocher quatre tags ne doit pas demander quatre
      // retours en arrière pour revenir à la page d'où l'on vient.
      router.replace(params ? `/catalogue?${params}` : "/catalogue", {
        scroll: options?.scroll ?? false,
      });
    },
    [query, router],
  );

  const { data, isLoading, hasFailed } = useModCatalogue(query);

  // Le champ garde sa propre valeur pendant la frappe : passer par l'URL à chaque
  // lettre lancerait une requête par caractère (US-E3).
  const [searchInput, setSearchInput] = useState(query.search);

  useEffect(() => {
    const trimmed = searchInput.trim().slice(0, MAX_SEARCH_LENGTH);
    if (trimmed === query.search) return;

    const timer = setTimeout(() => updateQuery({ search: trimmed }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, query.search, updateQuery]);

  // Le vocabulaire réel, alimenté par les fiches des membres (US-C1).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tags", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: { name: string; modCount: number }[]) =>
        setKnownTags(rows.map((row) => ({ name: row.name, count: row.modCount }))),
      )
      // Le filtre par tags marche encore en dégradé : les tags actifs restent affichés.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const availableTags = useMemo(() => {
    const counts = new Map(knownTags.map((tag) => [tag.name, tag.count]));

    // Un tag venu de l'URL mais inconnu de la base reste affiché, sinon le filtre serait
    // actif sans que rien ne le montre — ni ne permette de le retirer.
    for (const tag of query.tags) if (!counts.has(tag)) counts.set(tag, 0);

    return Array.from(counts, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
  }, [knownTags, query.tags]);

  const toggleTag = useCallback(
    (tag: string) => {
      updateQuery({
        tags: query.tags.includes(tag)
          ? query.tags.filter((active) => active !== tag)
          : [...query.tags, tag],
      });
    },
    [query.tags, updateQuery],
  );

  if (isAuthLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  const mods = data?.mods.map(apiModToView) ?? [];
  const counts = data?.counts ?? { all: 0, CAR: 0, TRACK: 0 };
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  const hasFilters = query.tags.length > 0 || query.type !== null || query.search !== "";

  // US-G1/G3 — la soirée en cours vient avec la liste (`ModListResponse`) : c'est elle
  // qui rend les fiches votables, et le panneau ci-dessous l'annonce.
  const currentSoiree = data?.currentSoiree ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        active="catalogue"
        subtitle={session?.guildName ?? "serveur"}
        stats={[
          { label: "FICHES", value: siteStats.fiches },
          { label: "VOTES", value: siteStats.votes },
        ]}
        cta={{ label: "Proposer un mod", href: "/mods/nouveau" }}
      />

      <div className="grid flex-1 grid-cols-[236px_1fr] items-start">
        <aside className="flex flex-col gap-5 border-r border-[var(--color-border)] p-[18px]">
          <div className="flex items-center gap-2 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[11px] py-[9px]">
            <span className="font-mono text-[11px] text-[var(--color-text-faint)]">⌕</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder="nom du mod"
              aria-label="Rechercher un mod par nom"
              className="w-full bg-transparent font-mono text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
            />
          </div>

          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TYPE
            </div>
            <div className="flex flex-col gap-1">
              {TYPE_FILTERS.map((option) => {
                const isActive = query.type === option.key;
                return (
                  <button
                    key={option.key ?? "all"}
                    type="button"
                    onClick={() => updateQuery({ type: option.key })}
                    aria-pressed={isActive}
                    className={`flex justify-between rounded-sm px-[10px] py-[7px] font-sans text-xs font-medium ${
                      isActive
                        ? "btn-solid"
                        : "btn-outline text-[var(--color-text-secondary)] hover:text-[var(--color-foreground)]"
                    }`}
                    style={
                      isActive
                        ? {
                            background: "var(--color-emphasis-bg)",
                            color: "var(--color-emphasis-text)",
                          }
                        : undefined
                    }
                  >
                    <span>{option.label}</span>
                    <span className="font-mono text-[11px]" style={{ opacity: isActive ? 1 : 0.7 }}>
                      {option.key ? counts[option.key] : counts.all}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TAGS · {query.tags.length} ACTIFS
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {availableTags.map((tag) => (
                <TagPill
                  key={tag.name}
                  label={tag.name}
                  active={query.tags.includes(tag.name)}
                  removable={query.tags.includes(tag.name)}
                  onClick={() => toggleTag(tag.name)}
                />
              ))}
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  updateQuery({ tags: [], type: null, search: "" });
                }}
                className="link-underline mt-[10px] inline-block border-b font-sans text-[11px] font-medium text-[var(--color-link)]"
                style={{ borderColor: "var(--color-amber)" }}
              >
                réinitialiser les filtres
              </button>
            )}
          </div>

          {/* US-G1 — la prochaine soirée, telle qu'elle est en base. Tant qu'aucune n'est
              programmée, le panneau dit pourquoi les boutons de vote sont éteints
              plutôt que de disparaître sans un mot. */}
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              PROCHAINE SOIRÉE
            </div>
            {currentSoiree ? (
              <>
                <Link
                  href="/soiree"
                  className="link-title mt-1 block font-sans text-sm font-semibold leading-[1.3]"
                >
                  {formatSoireeDate(new Date(currentSoiree.date))}
                </Link>
                {currentSoiree.name && (
                  <div className="font-mono text-[10px] leading-[1.5] text-[var(--color-text-secondary)]">
                    thème : {currentSoiree.name}
                  </div>
                )}
                <div className="mt-[9px] font-mono text-[10px] text-[var(--color-text-muted)]">
                  {currentSoiree.modCount} mod{currentSoiree.modCount > 1 ? "s" : ""} engagé
                  {currentSoiree.modCount > 1 ? "s" : ""} · seuls ceux-là sont votables
                </div>
              </>
            ) : (
              <div className="mt-1 font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-secondary)]">
                Aucune soirée programmée. Le vote rouvrira avec la prochaine — un admin
                la crée depuis l&apos;espace admin.
              </div>
            )}
          </div>
        </aside>

        <div className="p-[18px]">
          <div className="mb-[14px] flex items-baseline justify-between gap-4">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              {/* Tant que la première réponse n'est pas là, annoncer « 0 RÉSULTATS »
                  serait un mensonge : on ne sait pas encore. */}
              {data === null ? "CHARGEMENT…" : `${total} RÉSULTAT${total > 1 ? "S" : ""}`}
              {pageCount > 1 ? ` · PAGE ${query.page} SUR ${pageCount}` : ""}
              {query.tags.length > 0 ? ` — FILTRE : ${query.tags.join(" + ").toUpperCase()}` : ""}
            </div>
            <label className="flex shrink-0 items-center gap-[6px] font-mono text-[11px] text-[var(--color-text-secondary)]">
              tri :
              <select
                value={query.sort}
                onChange={(event) => updateQuery({ sort: event.target.value as ModSort })}
                className="btn-outline cursor-pointer rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[6px] py-[3px] font-mono text-[11px] text-[var(--color-foreground)] outline-none"
              >
                {MOD_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* La grille est estompée pendant qu'une nouvelle réponse arrive, plutôt que
              vidée : les cartes affichées se périment un instant, elles ne sautent pas. */}
          <div
            className="grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3"
            style={{ opacity: isLoading && data !== null ? 0.55 : 1 }}
            aria-busy={isLoading}
          >
            {mods.map((mod) => (
              <ModCard key={mod.id} mod={mod} />
            ))}
          </div>

          {hasFailed && data === null && (
            <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
              <p className="font-sans text-sm font-semibold">Le catalogue n&apos;a pas pu être chargé.</p>
              <p className="mt-[6px] font-mono text-[10.5px] text-[var(--color-text-muted)]">
                Vérifie ta connexion, puis recharge la page.
              </p>
            </div>
          )}

          {data !== null && total === 0 && (
            <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
              {hasFilters ? (
                <>
                  <p className="font-sans text-sm font-semibold">Aucune fiche ne correspond.</p>
                  <p className="mt-[6px] font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
                    Les filtres se combinent : chaque tag, le type et la recherche
                    restreignent un peu plus. Retires-en un, ou{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput("");
                        updateQuery({ tags: [], type: null, search: "" });
                      }}
                      className="link-underline border-b text-[var(--color-link)]"
                      style={{ borderColor: "var(--color-amber)" }}
                    >
                      réinitialise les filtres
                    </button>
                    .
                  </p>
                </>
              ) : (
                <>
                  <p className="font-sans text-sm font-semibold">Le catalogue est encore vide.</p>
                  <p className="mt-[6px] font-mono text-[10.5px] text-[var(--color-text-muted)]">
                    Personne n&apos;a encore proposé de mod — à toi l&apos;honneur.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Page demandée au-delà de la dernière : un lien direct devenu caduc, ou une
              fiche supprimée depuis. Le compteur dit qu'il y a des résultats, la grille
              est vide — il faut expliquer pourquoi. */}
          {data !== null && total > 0 && mods.length === 0 && (
            <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
              <p className="font-sans text-sm font-semibold">Cette page n&apos;existe plus.</p>
              <p className="mt-[6px] font-mono text-[10.5px] text-[var(--color-text-muted)]">
                Le catalogue s&apos;arrête à la page {pageCount}.{" "}
                <button
                  type="button"
                  onClick={() => updateQuery({ page: 1 }, { scroll: true })}
                  className="link-underline border-b text-[var(--color-link)]"
                  style={{ borderColor: "var(--color-amber)" }}
                >
                  Revenir au début
                </button>
                .
              </p>
            </div>
          )}

          {pageCount > 1 && (
            <nav
              aria-label="Pages du catalogue"
              className="mt-4 flex items-center justify-center gap-4 font-mono text-[11px]"
            >
              <button
                type="button"
                disabled={query.page <= 1}
                onClick={() => updateQuery({ page: query.page - 1 }, { scroll: true })}
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[10px] py-[5px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← précédent
              </button>
              <span className="text-[var(--color-text-muted)]">
                page {query.page} sur {pageCount}
              </span>
              <button
                type="button"
                disabled={query.page >= pageCount}
                onClick={() => updateQuery({ page: query.page + 1 }, { scroll: true })}
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[10px] py-[5px] disabled:cursor-not-allowed disabled:opacity-40"
              >
                suivant →
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
