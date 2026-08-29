"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ModCard } from "@/components/ModCard";
import { ProgressBar } from "@/components/ProgressBar";
import { TagPill } from "@/components/TagPill";
import { parseTagsParam, serializeTagsParam } from "@/lib/mods/tags";
import {
  currentSession,
  mods,
  siteStats,
  tags as demoTags,
  type ModType,
} from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

type TypeFilter = "all" | ModType;

interface AvailableTag {
  name: string;
  count: number;
}

export function CatalogueView() {
  const { session, isLoading } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [knownTags, setKnownTags] = useState<AvailableTag[]>([]);

  // US-C2 — l'URL est la seule source de vérité des tags actifs, pas un état local.
  // Un lien `/catalogue?tags=drift,jdm` arrive donc déjà filtré, la sélection survit à
  // un rechargement, et une pastille cliquée depuis une fiche de mod atterrit juste.
  const activeTags = useMemo(
    () => parseTagsParam(searchParams.getAll("tags")),
    [searchParams],
  );

  const setActiveTags = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams);
      params.delete("tags");
      if (next.length > 0) params.set("tags", serializeTagsParam(next));

      const query = params.toString();
      // `replace` plutôt que `push` : cocher quatre tags ne doit pas demander quatre
      // retours en arrière pour revenir à la page d'où l'on vient.
      router.replace(query ? `/catalogue?${query}` : "/catalogue", { scroll: false });
    },
    [router, searchParams],
  );

  // Le vocabulaire réel, alimenté par les fiches des membres (US-C1).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tags", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: { name: string; modCount: number }[]) =>
        setKnownTags(rows.map((row) => ({ name: row.name, count: row.modCount }))),
      )
      // Les tags de démo restent affichés : le filtre marche encore, en dégradé.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of knownTags) counts.set(tag.name, tag.count);

    // Les fiches de démonstration vivent encore en dur, et leurs tags ne sont pas en
    // base : sans ce second passage, le filtre n'aurait rien à mordre tant que le
    // catalogue n'est pas branché sur GET /api/mods (US-E1). Cette boucle disparaîtra
    // avec les fiches mock.
    for (const tag of demoTags) counts.set(tag.name, (counts.get(tag.name) ?? 0) + tag.count);

    // Un tag venu de l'URL mais inconnu des deux sources reste affiché, sinon le filtre
    // serait actif sans que rien ne le montre — ni ne permette de le retirer.
    for (const tag of activeTags) if (!counts.has(tag)) counts.set(tag, 0);

    return Array.from(counts, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
  }, [knownTags, activeTags]);

  const vehiculeCount = mods.filter((mod) => mod.type === "vehicule").length;
  const circuitCount = mods.filter((mod) => mod.type === "circuit").length;

  const filteredMods = useMemo(() => {
    return mods
      .filter((mod) => (typeFilter === "all" ? true : mod.type === typeFilter))
      .filter((mod) => (search.trim() ? mod.name.toLowerCase().includes(search.trim().toLowerCase()) : true))
      // Les tags se combinent en ET, comme côté API : `drift + jdm` veut dire les deux.
      .filter((mod) => activeTags.every((tag) => mod.tags.includes(tag)))
      .sort((a, b) => b.totalVotes - a.totalVotes);
  }, [typeFilter, search, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags(
      activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag],
    );
  }

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  const engagedCount = currentSession.engagedMods.length + currentSession.extraEngagedCount;
  const sessionProgress = Math.round((currentSession.membersVoted / currentSession.membersTotal) * 100);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        active="catalogue"
        subtitle={`${session?.guildName ?? "serveur"} · ${currentSession.membersTotal} membres`}
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
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="nom du mod"
              className="w-full bg-transparent font-mono text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
            />
          </div>

          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TYPE
            </div>
            <div className="flex flex-col gap-1">
              {(
                [
                  { key: "all", label: "Tous", count: mods.length },
                  { key: "vehicule", label: "Véhicules", count: vehiculeCount },
                  { key: "circuit", label: "Circuits", count: circuitCount },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setTypeFilter(option.key)}
                  className="flex justify-between rounded-sm px-[10px] py-[7px] font-sans text-xs font-medium"
                  style={
                    typeFilter === option.key
                      ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                      : { color: "var(--color-text-secondary)" }
                  }
                >
                  <span>{option.label}</span>
                  <span className="font-mono text-[11px]" style={{ opacity: typeFilter === option.key ? 1 : 0.7 }}>
                    {option.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TAGS · {activeTags.length} ACTIFS
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {availableTags.map((tag) => (
                <TagPill
                  key={tag.name}
                  label={tag.name}
                  active={activeTags.includes(tag.name)}
                  removable={activeTags.includes(tag.name)}
                  onClick={() => toggleTag(tag.name)}
                />
              ))}
            </div>
            {activeTags.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className="mt-[10px] inline-block border-b font-sans text-[11px] font-medium text-[var(--color-link)]"
                style={{ borderColor: "var(--color-amber)" }}
              >
                réinitialiser les filtres
              </button>
            )}
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              PROCHAINE SOIRÉE
            </div>
            <div className="mt-1 font-sans text-sm font-semibold leading-[1.3]">
              {currentSession.dateLabel} · {currentSession.timeLabel}
            </div>
            <div className="font-mono text-[10px] leading-[1.5] text-[var(--color-text-secondary)]">
              thème : {currentSession.theme}
            </div>
            <div className="mt-[9px]">
              <ProgressBar percent={sessionProgress} height={3} />
            </div>
            <div className="mt-[5px] font-mono text-[10px] text-[var(--color-text-muted)]">
              {engagedCount} mods engagés · {currentSession.membersVoted} votants
            </div>
          </div>
        </aside>

        <div className="p-[18px]">
          <div className="mb-[14px] flex items-baseline justify-between">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              {filteredMods.length} RÉSULTATS SUR {mods.length}
              {activeTags.length > 0 ? ` — FILTRE : ${activeTags.join(" + ").toUpperCase()}` : ""}
            </div>
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)]">tri : votes ▾</div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMods.map((mod) => (
              <ModCard key={mod.id} mod={mod} />
            ))}
          </div>
          {filteredMods.length === 0 && activeTags.length > 0 && (
            <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
              <p className="font-sans text-sm font-semibold">Aucune fiche avec tous ces tags.</p>
              <p className="mt-[6px] font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
                Les tags se combinent : chaque tag ajouté restreint un peu plus. Retires-en
                un, ou{" "}
                <button
                  type="button"
                  onClick={() => setActiveTags([])}
                  className="border-b text-[var(--color-link)]"
                  style={{ borderColor: "var(--color-amber)" }}
                >
                  réinitialise les filtres
                </button>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
