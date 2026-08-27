"use client";

import Link from "next/link";
import { useState } from "react";
import type { Mod } from "@/lib/mock-data";
import { AvatarPlaceholder } from "./AvatarPlaceholder";
import { MiniBarChart } from "./MiniBarChart";
import { TagPill } from "./TagPill";
import { TypeBadge } from "./TypeBadge";

interface ModCardProps {
  mod: Mod;
}

export function ModCard({ mod }: ModCardProps) {
  const [voted, setVoted] = useState(false);
  const votes = mod.totalVotes + (voted ? 1 : 0);

  return (
    <article className="flex flex-col gap-[10px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[13px]">
      <Link href={`/mods/${mod.id}`} className="flex gap-[11px]">
        <AvatarPlaceholder size={52} variant="thumb" />
        <div className="min-w-0">
          <TypeBadge type={mod.type} />
          <div className="mt-[2px] text-pretty text-sm font-semibold leading-tight">{mod.name}</div>
        </div>
      </Link>
      <div className="flex gap-1">
        {mod.tags.map((tag) => (
          <TagPill key={tag} label={tag} />
        ))}
      </div>
      <MiniBarChart values={mod.voteHistory} dimmed={mod.totalVotes < 6} />
      <div className="flex items-center justify-between border-t border-[var(--color-border-hairline)] pt-[9px]">
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
          {mod.author} · {mod.ageLabel}
        </span>
        <button
          type="button"
          onClick={() => setVoted((v) => !v)}
          className="flex items-center gap-[6px] rounded-sm px-[9px] py-[5px] font-mono text-xs"
          style={{
            background: voted ? "var(--color-ink)" : "transparent",
            color: voted ? "var(--color-surface)" : "var(--color-foreground)",
            border: voted ? "none" : "1px solid var(--color-border-strong)",
          }}
        >
          {voted && <span className="font-sans text-[10px] font-semibold">+1</span>}
          <span>{String(votes).padStart(2, "0")}</span>
        </button>
      </div>
    </article>
  );
}
