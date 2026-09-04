"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ModCard } from "@/components/ModCard";
import { PageLoader } from "@/components/PageLoader";
import { TagPill } from "@/components/TagPill";
import type { ModType } from "@/lib/generated/prisma/enums";
import {
  MAX_SEARCH_LENGTH,
  MOD_SORTS,
  MODS_PER_PAGE,
  modQueryToSearchParams,
  parseModQuery,
  SEARCH_DEBOUNCE_MS,
  type ModQuery,
  type ModSort,
} from "@/lib/mods/query";
import { useModCatalogue } from "@/lib/mods/useCatalogue";
import { apiModToView } from "@/lib/mods/view";
import { formatSoireeDate } from "@/lib/soirees/format";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useSiteStats } from "@/lib/useSiteStats";
import { ActiveFilterBar, type ActiveFilter } from "./ActiveFilterBar";

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

/** Cible d'`aria-controls` : le bouton replié doit pouvoir désigner le panneau. */
const FILTERS_PANEL_ID = "catalogue-filters";

/** US-E4 — les tris de la route, sous les mots de l'interface. */
const SORT_LABELS: Record<ModSort, string> = {
  date: "date d'ajout",
  votes: "votes",
  az: "nom (A → Z)",
  za: "nom (Z → A)",
};

export function CatalogueView() {
  const { session, isLoading: isAuthLoading } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [knownTags, setKnownTags] = useState<AvailableTag[]>([]);
  /**
   * Le panneau de filtres est une colonne à partir de `lg`, et un tiroir replié en
   * dessous : sur un téléphone, il pousserait la première fiche à un écran et demi du
   * haut de page. Ouvert, il remplace la liste plutôt que de la coiffer — on filtre,
   * puis on regarde.
   */
  const [areFiltersOpen, setAreFiltersOpen] = useState(false);
  /**
   * Le même seuil que `lg:` ci-dessous, mais lisible en JavaScript : deux réglages ne
   * se déduisent pas d'une classe CSS — la racine du défilement et l'élément qu'on
   * ramène en haut changent de nature selon que la colonne défile ou que la page défile.
   */
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Les compteurs de l'en-tête portent sur tout le site, pas sur la page affichée :
  // ils viennent de leur propre route, et non de la réponse filtrée du catalogue.
  const stats = useSiteStats();

  // L'URL est la seule source de vérité des filtres, pas un état local : un lien
  // `/catalogue?tags=drift,jdm&type=CAR&sort=votes` arrive donc déjà filtré, la
  // sélection survit à un rechargement, et une pastille cliquée depuis une fiche de mod
  // atterrit juste. C'est le même analyseur que celui de GET /api/mods (US-E1).
  const query = useMemo(() => parseModQuery(searchParams), [searchParams]);

  const updateQuery = useCallback(
    (patch: Partial<ModQuery>) => {
      // `page: 1` efface un `?page=` hérité d'un lien d'avant le défilement continu :
      // la liste se déroule depuis le début, l'URL ne doit pas prétendre le contraire.
      const next: ModQuery = { ...query, page: 1, ...patch };
      const params = modQueryToSearchParams(next).toString();

      // `replace` plutôt que `push` : cocher quatre tags ne doit pas demander quatre
      // retours en arrière pour revenir à la page d'où l'on vient. `scroll: false` :
      // c'est la colonne de droite qui défile, pas la fenêtre — la remonter est le
      // travail de l'effet sur `filtersKey`.
      router.replace(params ? `/catalogue?${params}` : "/catalogue", { scroll: false });
    },
    [query, router],
  );

  const { data, mods: loadedMods, isLoading, isLoadingMore, hasMore, loadMore, hasFailed, retry } =
    useModCatalogue(query);

  // Sur un grand écran, la colonne de droite est le seul bloc qui défile : l'en-tête et
  // le panneau de filtres restent en place. C'est donc elle — et non la fenêtre — que
  // l'observateur du bas de liste doit surveiller, et elle qu'il faut ramener en haut au
  // changement de filtre. Sous `lg`, la coque tombe et c'est la page qui défile : les
  // deux mécanismes basculent alors sur la fenêtre (`isDesktop`).
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // La signature des filtres, page exclue : la même que celle du hook, qui vide sa pile
  // en la voyant changer.
  const filtersKey = useMemo(
    () => modQueryToSearchParams({ ...query, page: 1 }).toString(),
    [query],
  );

  // Filtres changés : on remonte en haut de la liste. Rester à mi-hauteur d'une liste
  // qu'on vient de remplacer donne l'impression d'avoir sauté les premiers résultats.
  useEffect(() => {
    if (isDesktop) listRef.current?.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [filtersKey, isDesktop]);

  // US-E1 — le défilement continu : une sentinelle en bas de grille, et la page
  // suivante part quand elle approche. `rootMargin` la déclenche 400 px avant qu'elle
  // n'entre à l'écran, pour que les cartes soient là avant qu'on arrive au bout.
  //
  // L'observateur se remonte à chaque changement d'état plutôt que de vivre une fois
  // pour toutes : c'est ce qui le fait re-tester la sentinelle après une page reçue,
  // sans quoi une fenêtre haute — où la sentinelle reste visible — n'en chargerait
  // jamais qu'une. `loadMore` se garde tout seul des appels de trop.
  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore || isLoadingMore || hasFailed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      // `root: null` = la fenêtre, qui est bien ce qui défile sous `lg`.
      { root: isDesktop ? listRef.current : null, rootMargin: "400px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, hasFailed, loadMore, isDesktop]);

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

  // US-J1 — les trois critères tombent ensemble. Le champ de recherche garde sa propre
  // valeur pendant la frappe : le vider ici aussi, sinon l'effet de debounce
  // réécrirait la recherche dans l'URL un quart de seconde après sa remise à zéro.
  const clearFilters = useCallback(() => {
    setSearchInput("");
    updateQuery({ tags: [], type: null, search: "" });
  }, [updateQuery]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    updateQuery({ search: "" });
  }, [updateQuery]);

  if (isAuthLoading) {
    return <PageLoader />;
  }

  const mods = loadedMods.map(apiModToView);
  const counts = data?.counts ?? { all: 0, CAR: 0, TRACK: 0 };
  const total = data?.total ?? 0;
  const hasFilters = query.tags.length > 0 || query.type !== null || query.search !== "";

  // US-J1 — les critères dans l'ordre où la colonne de gauche les propose, pour que la
  // barre et le panneau se lisent dans le même sens.
  const activeFilters: ActiveFilter[] = [
    ...(query.search
      ? [{ key: "search", kind: "nom", label: `« ${query.search} »`, onRemove: clearSearch }]
      : []),
    ...(query.type
      ? [
          {
            key: "type",
            kind: "type",
            label: TYPE_FILTERS.find((option) => option.key === query.type)?.label ?? query.type,
            onRemove: () => updateQuery({ type: null }),
          },
        ]
      : []),
    ...query.tags.map((tag) => ({
      key: `tag:${tag}`,
      kind: "tag",
      label: tag,
      onRemove: () => toggleTag(tag),
    })),
  ];

  const activeFilterCount = activeFilters.length;

  // US-G1/G3 — la soirée en cours vient avec la liste (`ModListResponse`) : c'est elle
  // qui rend les fiches votables, et le panneau ci-dessous l'annonce.
  const currentSoiree = data?.currentSoiree ?? null;

  return (
    /* Coque d'application, à partir de `lg` : la fenêtre ne défile pas, la colonne de
       droite si. C'est ce qui tient l'en-tête et le panneau de filtres en place pendant
       qu'on déroule le catalogue — et ce qui donne à la sentinelle du défilement continu
       une racine à observer (`listRef`).

       Sous `lg`, la coque tombe : une hauteur bloquée à `100vh` se bat avec la barre
       d'adresse des navigateurs mobiles, qui se rétracte au défilement, et deux zones
       de défilement imbriquées sur un écran de téléphone ne laissent plus voir ni
       l'une ni l'autre. La page défile alors comme une page. */
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <AppHeader
        active="catalogue"
        subtitle={session?.guildName ?? "serveur"}
        stats={[
          { label: "MODS", value: stats?.mods ?? "—" },
          { label: "SOIRÉES", value: stats?.soirees ?? "—" },
        ]}
        cta={{ label: "Proposer un mod", href: "/mods/nouveau" }}
      />

      {/* Le bouton n'existe que là où le panneau est replié. Le compte des critères
          actifs est écrit dessus : replié, le panneau ne peut plus dire lui-même qu'il
          filtre, et une liste courte sans explication se lit comme un catalogue vide. */}
      <button
        type="button"
        onClick={() => setAreFiltersOpen((current) => !current)}
        aria-expanded={areFiltersOpen}
        aria-controls={FILTERS_PANEL_ID}
        className="btn-outline flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 font-mono text-[11px] text-[var(--color-text-secondary)] lg:hidden"
      >
        <span>
          {areFiltersOpen ? "▾" : "▸"} FILTRES
          {activeFilterCount > 0 && ` · ${activeFilterCount} ACTIF${activeFilterCount > 1 ? "S" : ""}`}
        </span>
        <span className="text-[var(--color-text-faint)]">
          {data === null ? "…" : `${total} résultat${total > 1 ? "s" : ""}`}
        </span>
      </button>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[236px_1fr]">
        {/* Le panneau défile pour lui-même : un vocabulaire de tags un peu fourni ne
            doit pas emmener la liste des mods avec lui. */}
        <aside
          id={FILTERS_PANEL_ID}
          className={`${
            areFiltersOpen ? "flex" : "hidden"
          } flex-col gap-5 overflow-y-auto border-b border-[var(--color-border)] p-4 lg:flex lg:h-full lg:border-b-0 lg:border-r lg:p-[18px]`}
        >
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
                onClick={clearFilters}
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

        <div ref={listRef} className="p-4 lg:h-full lg:overflow-y-auto lg:p-[18px]">
          <div className="mb-[14px] flex items-baseline justify-between gap-4">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              {/* Tant que la première réponse n'est pas là, annoncer « 0 RÉSULTATS »
                  serait un mensonge : on ne sait pas encore. */}
              {data === null ? "CHARGEMENT…" : `${total} RÉSULTAT${total > 1 ? "S" : ""}`}
              {/* En défilement continu, le total ne dit plus où l'on en est : c'est le
                  nombre de fiches déjà déroulées qui le dit. Affiché seulement tant
                  qu'il en reste — « 24 · 24 AFFICHÉES » n'apprend rien. */}
              {data !== null && mods.length < total ? ` · ${mods.length} AFFICHÉES` : ""}
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

          <ActiveFilterBar filters={activeFilters} onReset={clearFilters} />

          {/* La grille est estompée pendant qu'une **première** page arrive, plutôt que
              vidée : les cartes affichées se périment un instant, elles ne sautent pas.
              Une page suivante, elle, ne touche à rien de ce qui est déjà là. */}
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
                      onClick={clearFilters}
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

          {/* US-E1 — le bas de la liste, en défilement continu. La sentinelle est un bloc
              vide : c'est son approche du bord qui demande la suite (voir l'observateur
              plus haut), pas un clic. Elle n'existe que tant qu'il reste des fiches. */}
          {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}

          {isLoadingMore && (
            <p
              role="status"
              className="mt-4 text-center font-mono text-[10.5px] text-[var(--color-text-muted)]"
            >
              chargement des fiches suivantes…
            </p>
          )}

          {/* Une page suivante qui échoue ne vide pas la liste : elle propose de
              reprendre là où ça s'est arrêté. Le bouton, parce qu'un rechargement
              automatique sur une connexion coupée boucle sans rien dire. */}
          {hasFailed && data !== null && (
            <div className="mt-4 rounded-sm border border-dashed border-[var(--color-border-dashed)] p-4 text-center">
              <p className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
                La suite du catalogue n&apos;a pas pu être chargée.{" "}
                <button
                  type="button"
                  onClick={retry}
                  className="link-underline border-b text-[var(--color-link)]"
                  style={{ borderColor: "var(--color-amber)" }}
                >
                  Réessayer
                </button>
                .
              </p>
            </div>
          )}

          {/* Le bout de la liste, dit explicitement : sans cette ligne, une liste qui
              s'arrête ressemble à une liste qui n'a pas fini de charger. Affiché
              seulement quand il y a eu de quoi dérouler — en dessous d'une page, la fin
              va de soi. */}
          {!hasMore && !hasFailed && mods.length > MODS_PER_PAGE && (
            <p className="mt-5 text-center font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-faint)]">
              — FIN DU CATALOGUE · {mods.length} FICHE{mods.length > 1 ? "S" : ""} —
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
