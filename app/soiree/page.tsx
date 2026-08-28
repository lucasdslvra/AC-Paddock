"use client";

import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { MiniBarChart } from "@/components/MiniBarChart";
import { ProgressBar } from "@/components/ProgressBar";
import { StatBlock } from "@/components/StatBlock";
import { currentSession, getModById } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function SoireePage() {
  const { isLoading } = useRequireAuth();
  const [votes, setVotes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(currentSession.engagedMods.map((entry) => [entry.modId, entry.voted])),
  );
  const [showAll, setShowAll] = useState(false);

  const rankedMods = useMemo(() => {
    return currentSession.engagedMods
      .map((entry) => {
        const mod = getModById(entry.modId);
        const extraVote = votes[entry.modId] && !entry.voted ? 1 : !votes[entry.modId] && entry.voted ? -1 : 0;
        return { entry, mod, displayVotes: entry.sessionVotes + extraVote };
      })
      .filter((row) => row.mod)
      .sort((a, b) => b.displayVotes - a.displayVotes);
  }, [votes]);

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  const votedCount = Object.values(votes).filter(Boolean).length;
  const total = currentSession.engagedMods.length;
  const visibleRows = showAll ? rankedMods : rankedMods.slice(0, 6);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="soiree" cta={{ label: "Engager un mod", href: "/mods/nouveau" }} />

      <div className="flex items-end gap-7 border-b border-[var(--color-border)] px-[22px] py-[18px]">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            SOIRÉE EN COURS · THÈME {currentSession.theme.toUpperCase()}
          </div>
          <h1 className="mt-2 font-sans text-[38px] font-bold leading-none tracking-[-0.035em]">
            {currentSession.dateLabel[0].toUpperCase() + currentSession.dateLabel.slice(1)} ·{" "}
            {currentSession.timeLabel}
          </h1>
          <div className="mt-[7px] font-mono text-[11px] text-[var(--color-text-secondary)]">
            créée par {currentSession.createdBy} · {total} mods engagés · vote ouvert jusqu&apos;à{" "}
            {currentSession.votingClosesLabel}
          </div>
        </div>
        <div className="ml-auto flex items-end gap-[26px]">
          <StatBlock label="IL RESTE" value={currentSession.daysRemainingLabel} valueSize={26} />
          <StatBlock
            label="ONT VOTÉ"
            value={`${currentSession.membersVoted} / ${currentSession.membersTotal}`}
            valueSize={26}
          />
          <div className="flex flex-col gap-[5px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">MEMBRES</div>
            <div className="flex gap-1">
              {Array.from({ length: currentSession.membersTotal }).map((_, index) => (
                <AvatarPlaceholder
                  key={index}
                  size={22}
                  ring={index < currentSession.membersVoted}
                  dimmed={index >= currentSession.membersVoted}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[18px] p-[18px] lg:grid-cols-[1fr_300px]">
        <div>
          <div className="mb-[10px] flex items-baseline justify-between">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              CLASSEMENT EN DIRECT
            </div>
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
              mise à jour à chaque vote
            </div>
          </div>
          <div className="flex flex-col gap-[7px]">
            {visibleRows.map((row, index) => {
              if (!row.mod) return null;
              const isVoted = votes[row.entry.modId];
              return (
                <article
                  key={row.entry.modId}
                  className="grid grid-cols-[44px_56px_1fr_132px_96px] items-center gap-[13px] rounded-sm border p-[11px_14px]"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                    borderLeft: index === 0 ? "3px solid var(--color-amber)" : undefined,
                  }}
                >
                  <div className="font-mono text-xl leading-none">{String(index + 1).padStart(2, "0")}</div>
                  <div
                    className="h-[42px] rounded-sm"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 4px, var(--color-placeholder-b) 4px 8px)",
                    }}
                  />
                  <div>
                    <div className="font-sans text-[15px] font-semibold leading-tight">{row.mod.name}</div>
                    <div className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
                      {row.mod.type === "vehicule" ? "véhicule" : "circuit"} · {row.mod.tags.join(", ")} ·
                      engagé par {row.entry.engagedBy}
                      {row.entry.note && <span className="text-[var(--color-link)]"> · {row.entry.note}</span>}
                    </div>
                  </div>
                  <MiniBarChart values={row.mod.voteHistory} height={26} dimmed={!isVoted} />
                  <div className="flex items-center justify-end gap-[9px]">
                    <span className="font-mono text-xl">{row.displayVotes}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setVotes((current) => ({ ...current, [row.entry.modId]: !current[row.entry.modId] }))
                      }
                      className="rounded-sm px-[11px] py-[7px] font-sans text-xs font-semibold"
                      style={
                        isVoted
                          ? { background: "var(--color-amber)", color: "var(--color-ink)" }
                          : { border: "1px solid var(--color-border-strong)" }
                      }
                    >
                      {isVoted ? "✓ voté" : "+1"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {!showAll && currentSession.extraEngagedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 flex w-full items-center justify-between rounded-sm border border-dashed border-[var(--color-border-dashed)] px-[14px] py-[11px]"
            >
              <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
                {currentSession.extraEngagedCount} autres mods engagés sans aucun vote
              </span>
              <span className="border-b font-sans text-[11px] font-medium text-[var(--color-link)]" style={{ borderColor: "var(--color-amber)" }}>
                tout afficher
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-sm p-4" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-on-ink)]">
              CE QUI SE DÉGAGE
            </div>
            <div className="mt-2 font-sans text-[15px] font-semibold leading-[1.35]">
              AE86 sur Akina. Personne n&apos;est surpris.
            </div>
            <div className="mt-2 font-mono text-[10px] leading-[1.6] text-[var(--color-text-on-ink)]">
              Les 3 premiers seront installés d&apos;office. Le reste, si on a le temps.
            </div>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">TON VOTE</div>
            <div className="mt-2 font-mono text-[11.5px] leading-[1.7] text-[var(--color-text-secondary)]">
              Tu as voté pour {votedCount} mod{votedCount > 1 ? "s" : ""} sur {total}. Un vote par mod, tu peux
              le retirer à tout moment.
            </div>
            <div className="mt-[10px]">
              <ProgressBar percent={(votedCount / total) * 100} fillColor="var(--color-ink)" />
            </div>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              PAS ENCORE VOTÉ
            </div>
            <div className="mt-[10px] flex flex-col gap-[7px]">
              {currentSession.nonVotedMembers.map((member) => (
                <div key={member} className="flex items-center gap-2">
                  <AvatarPlaceholder size={20} dimmed />
                  <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">{member}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-sm border border-[var(--color-border-strong)] py-[9px] text-center font-sans text-[11px] font-medium"
            >
              Relancer sur Discord
            </button>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              FICHIERS À RÉ-UPLOADER
            </div>
            <div className="mt-2 font-mono text-[11px] leading-[1.7] text-[var(--color-text-secondary)]">
              {currentSession.filesToReuploadCount} mods du classement n&apos;ont plus de fichier (expiré).
              Le lien externe reste dispo.
            </div>
            <button
              type="button"
              className="mt-[10px] w-full rounded-sm py-[9px] text-center font-sans text-[11px] font-semibold"
              style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
            >
              Voir lesquels
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
