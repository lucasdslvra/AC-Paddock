"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import type { ApiMember } from "@/lib/soirees/serialize";

interface SoireeParticipantsCardProps {
  soireeId: string;
  participants: ApiMember[];
  /** Le membre connecté a-t-il rejoint ? */
  joined: boolean;
  /**
   * On peut encore rejoindre ou quitter : soirée en cours, vote ouvert. Sinon la carte
   * n'est plus qu'une liste — les inscrits de ce soir-là.
   */
  canChange: boolean;
  /** Rappelé après une inscription ou un départ, pour relire la soirée. */
  onChanged: () => void;
}

/**
 * Les inscrits de la soirée, et le bouton pour en être — ou ne plus en être.
 *
 * Être sur le serveur Discord ne suffit plus : on rejoint la soirée, et c'est ce qui
 * ouvre le vote et l'engagement. Quitter emporte ses votes, d'où la confirmation.
 */
export function SoireeParticipantsCard({
  soireeId,
  participants,
  joined,
  canChange,
  onChanged,
}: SoireeParticipantsCardProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (isPending) return;
    if (
      joined &&
      !window.confirm("Quitter la soirée ? Tes votes seront retirés du classement.")
    ) {
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/soirees/${soireeId}/participants`, {
        method: joined ? "DELETE" : "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          body?.error ?? (joined ? "Impossible de quitter la soirée." : "Impossible de rejoindre la soirée."),
        );
        return;
      }
      onChanged();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div
      className="rounded-sm border bg-[var(--color-surface)] p-[15px]"
      style={{
        // Tant qu'on n'en est pas, la carte est la première chose à faire sur la page :
        // elle prend la couleur de ce qui est à faire.
        borderColor: canChange && !joined ? "var(--color-amber)" : "var(--color-border)",
      }}
    >
      <div className="flex items-baseline justify-between font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        <span>PARTICIPANTS</span>
        <span>{participants.length}</span>
      </div>

      {canChange && !joined && (
        <p className="mt-[9px] font-mono text-[10.5px] leading-[1.7] text-[var(--color-text-secondary)]">
          Rejoins la soirée pour engager des mods et voter. Les inscrits qui n&apos;ont pas
          fini de voter sont rappelés sur Discord 30 minutes avant la fermeture.
        </p>
      )}

      {participants.length === 0 ? (
        <p className="mt-[9px] font-mono text-[10.5px] text-[var(--color-text-muted)]">
          Personne n&apos;a encore rejoint.
        </p>
      ) : (
        <ul className="mt-[10px] flex flex-wrap gap-x-3 gap-y-[7px]">
          {participants.map((member) => (
            <li key={member.discordId} className="flex items-center gap-[6px] font-mono text-[11px]">
              <UserAvatar src={member.avatarUrl} name={member.username} size={18} />
              {member.username}
            </li>
          ))}
        </ul>
      )}

      {canChange && (
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={isPending}
          aria-busy={isPending}
          className={
            joined
              ? "btn-outline mt-[12px] w-full rounded-sm border border-[var(--color-border-strong)] px-3 py-[8px] font-sans text-xs font-medium disabled:opacity-60"
              : "btn-solid mt-[12px] w-full rounded-sm px-3 py-[9px] font-sans text-xs font-semibold disabled:opacity-60"
          }
          style={
            joined
              ? undefined
              : { background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }
          }
        >
          {isPending ? "…" : joined ? "Quitter la soirée" : "Rejoindre la soirée"}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-[7px] font-mono text-[10px] leading-[1.5] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </div>
  );
}
