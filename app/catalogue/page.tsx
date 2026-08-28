"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ModCard } from "@/components/ModCard";
import { ProgressBar } from "@/components/ProgressBar";
import { TagPill } from "@/components/TagPill";
import { currentSession, mods, siteStats, tags, type ModType } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

type TypeFilter = "all" | ModType;

export default function CataloguePage() {
  const { session, isLoading } = useRequireAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const vehiculeCount = mods.filter((mod) => mod.type === "vehicule").length;
  const circuitCount = mods.filter((mod) => mod.type === "circuit").length;

  const filteredMods = useMemo(() => {
    return mods
      .filter((mod) => (typeFilter === "all" ? true : mod.type === typeFilter))
      .filter((mod) => (search.trim() ? mod.name.toLowerCase().includes(search.trim().toLowerCase()) : true))
      .filter((mod) => activeTags.every((tag) => mod.tags.includes(tag)))
      .sort((a, b) => b.totalVotes - a.totalVotes);
  }, [typeFilter, search, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
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
              {tags.map((tag) => (
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
        </div>
      </div>
    </div>
  );
}
