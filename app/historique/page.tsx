"use client";

import { AppHeader } from "@/components/AppHeader";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { StatBlock } from "@/components/StatBlock";
import { pastSessions, pastSessionsOlderCount } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function HistoriquePage() {
  const { isLoading } = useRequireAuth();

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  const totalModsPlayed = pastSessions.reduce((sum, session) => sum + session.podium.length, 0);
  const avgVotants = (
    pastSessions.reduce((sum, session) => sum + session.votants, 0) / pastSessions.length
  ).toFixed(1);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="historique" />

      <div className="flex items-end gap-[30px] p-[22px] pb-[18px]">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">ARCHIVES</div>
          <h1 className="mt-2 font-sans text-[36px] font-bold leading-none tracking-[-0.035em]">
            {pastSessions.length + pastSessionsOlderCount} soirées depuis février
          </h1>
        </div>
        <div className="ml-auto flex h-[52px] items-end gap-[3px]">
          {[40, 55, 35, 70, 60, 80, 50, 75, 65, 90, 70, 85, 95, 100].map((value, index, array) => (
            <div
              key={index}
              style={{
                width: 14,
                height: `${value}%`,
                background: index === array.length - 1 ? "var(--color-amber)" : "var(--color-border-strong)",
              }}
            />
          ))}
        </div>
        <div className="flex gap-[22px]">
          <StatBlock label="MODS JOUÉS" value={totalModsPlayed} order="value-first" />
          <StatBlock label="VOTANTS / SOIRÉE" value={avgVotants} order="value-first" />
        </div>
      </div>

      <div className="flex flex-col gap-[9px] p-[0_22px_22px]">
        <div className="grid grid-cols-[150px_1fr_300px_92px] gap-4 px-[15px] pb-[7px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          <span>DATE / THÈME</span>
          <span>PODIUM</span>
          <span>MODS ASSOCIÉS</span>
          <span className="text-right">VOTANTS</span>
        </div>
        {pastSessions.map((session) => (
          <article
            key={session.date}
            className="grid grid-cols-[150px_1fr_300px_92px] items-center gap-4 rounded-sm border p-[14px_15px]"
            style={{
              borderColor: session.faded ? "var(--color-border-hairline)" : "var(--color-border)",
              background: session.faded ? "rgba(251,250,247,.6)" : "var(--color-surface)",
            }}
          >
            <div>
              <div className="font-sans text-sm font-semibold" style={{ color: session.faded ? "var(--color-text-secondary)" : undefined }}>
                {session.date}
              </div>
              <div className="font-mono text-[9.5px] text-[var(--color-text-muted)]">{session.theme}</div>
            </div>
            <div className="flex flex-col gap-[5px]">
              {session.podium.map((entry) => (
                <div key={entry.rank} className="flex items-center gap-[9px]">
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: entry.rank === 1 && !session.faded ? "var(--color-link)" : "var(--color-text-faint)" }}
                  >
                    {entry.rank}
                  </span>
                  <span
                    className="font-sans text-[13px]"
                    style={{ fontWeight: entry.rank === 1 ? 500 : 400, color: entry.rank === 1 ? undefined : "var(--color-text-secondary)" }}
                  >
                    {entry.name}
                  </span>
                  <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">{entry.votes} votes</span>
                </div>
              ))}
            </div>
            <div className="flex gap-[5px]">
              {Array.from({ length: session.thumbCount }).map((_, index) => (
                <AvatarPlaceholder key={index} size={40} variant="thumb" dimmed={session.faded} />
              ))}
              {session.extraCount > 0 && (
                <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--color-border)] font-mono text-[10px] text-[var(--color-text-muted)]">
                  +{session.extraCount}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-[17px]" style={{ color: session.faded ? "var(--color-text-secondary)" : undefined }}>
                {session.votants}/{session.membersTotal}
              </div>
              <div className="font-mono text-[10px] text-[var(--color-text-faint)]">détail ↗</div>
            </div>
          </article>
        ))}
        <div className="flex items-center justify-center rounded-sm border border-dashed border-[var(--color-border-dashed)] p-3 font-sans text-[11.5px] font-medium text-[var(--color-text-secondary)]">
          {pastSessionsOlderCount} soirées plus anciennes
        </div>
      </div>
    </div>
  );
}
