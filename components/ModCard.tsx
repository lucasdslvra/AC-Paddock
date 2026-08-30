"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Mod } from "@/lib/mock-data";
import { useVote } from "@/lib/mods/useVote";
import { MiniBarChart } from "./MiniBarChart";
import { ModThumbnail } from "./ModThumbnail";
import { TagPill } from "./TagPill";
import { TypeBadge } from "./TypeBadge";
import { UserAvatar } from "./UserAvatar";

interface ModCardProps {
  mod: Mod;
}

export function ModCard({ mod }: ModCardProps) {
  const { data: session } = useSession();
  // US-F1 / US-F2 — le compteur affiché est celui de la fiche, le bouton celui du
  // membre connecté.
  const { votes, hasVoted, isPending, error, toggle } = useVote(
    mod.id,
    mod.totalVotes,
    mod.hasVoted ?? false,
  );
  // Mock authors have no avatar of their own; only the signed-in member does.
  const authorImage = session?.user?.name === mod.author ? session.user.image : null;

  return (
    <article className="flex flex-col gap-[10px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[13px]">
      <Link href={`/mods/${mod.id}`} className="flex gap-[11px]">
        <ModThumbnail src={mod.imageUrl} name={mod.name} size={52} />
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
      <MiniBarChart values={mod.voteHistory} dimmed={votes < 6} />
      <div className="flex items-center justify-between border-t border-[var(--color-border-hairline)] pt-[9px]">
        <span className="flex items-center gap-[6px] font-mono text-[10px] text-[var(--color-text-muted)]">
          <UserAvatar src={authorImage} name={mod.author} size={16} />
          {mod.author} · {mod.ageLabel}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hasVoted}
          aria-busy={isPending}
          aria-label={
            hasVoted ? `Retirer mon vote pour ${mod.name}` : `Voter pour ${mod.name}`
          }
          className="flex items-center gap-[6px] rounded-sm px-[9px] py-[5px] font-mono text-xs"
          style={{
            background: hasVoted ? "var(--color-ink)" : "transparent",
            color: hasVoted ? "var(--color-surface)" : "var(--color-foreground)",
            border: hasVoted ? "none" : "1px solid var(--color-border-strong)",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {hasVoted && <span className="font-sans text-[10px] font-semibold">+1</span>}
          <span>{String(votes).padStart(2, "0")}</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="font-mono text-[10px] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </article>
  );
}
