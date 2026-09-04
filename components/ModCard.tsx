"use client";

import Link from "next/link";
import type { Mod } from "@/lib/mock-data";
import { useVote } from "@/lib/mods/useVote";
import { MiniBarChart } from "./MiniBarChart";
import { MissingLinkBadge } from "./MissingLinkBadge";
import { ModThumbnail } from "./ModThumbnail";
import { TagPill } from "./TagPill";
import { TypeBadge } from "./TypeBadge";
import { UserAvatar } from "./UserAvatar";

interface ModCardProps {
  mod: Mod;
}

export function ModCard({ mod }: ModCardProps) {
  // US-G3/G4 — le compteur est celui de la soirée en cours, et il repart de zéro à
  // chaque nouvelle : la popularité de la fiche se lit dans les barres, au-dessus.
  const { soireeVotes, hasVoted, isPending, error, toggle } = useVote(mod.id, {
    votes: mod.totalVotes,
    soireeVotes: mod.engagement?.votes ?? 0,
    hasVoted: mod.hasVoted ?? false,
  });
  // Seuls les mods engagés dans la soirée en cours sont votables — les autres n'ont
  // pas de bouton du tout. Un bouton éteint se lit comme une panne, et il annoncerait
  // un « 00 » qui n'est le score de rien.
  const isEngaged = mod.engagement != null;

  return (
    <article className="card-interactive flex flex-col gap-[10px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[13px]">
      <div className="flex items-start gap-2">
        <Link href={`/mods/${mod.id}`} className="link-card flex min-w-0 flex-1 gap-[11px]">
          <ModThumbnail src={mod.imageUrl} name={mod.name} size={52} />
          <div className="min-w-0">
            <TypeBadge type={mod.type} />
            <div className="title-text mt-[2px] text-pretty text-sm font-semibold leading-tight">
              {mod.name}
            </div>
          </div>
        </Link>
        {/* Cahier §2.2 — le lien est facultatif, mais une fiche sans lien ne dit pas où
            prendre le mod : le catalogue la marque pour qu'on vienne la compléter. Le
            marqueur est hors du lien de la carte — un élément qui prend le focus n'a
            rien à faire dans une ancre, et son infobulle doit pouvoir s'ouvrir au
            clavier comme au survol. */}
        {!mod.primaryLink && <MissingLinkBadge className="flex-none" />}
      </div>
      {mod.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mod.tags.map((tag) => (
            <TagPill key={tag} label={tag} />
          ))}
        </div>
      )}
      {/* US-G4 — une barre par soirée où la fiche a été engagée. Les votes repartant de
          zéro à chaque soirée, c'est le seul endroit où se lit sa popularité. Estompées
          tant qu'aucune soirée ne lui a rapporté de vote : il n'y a rien à mettre en
          avant, mais la place reste tenue.

          `mt-auto` colle ce bloc et le pied de carte en bas : les cartes d'une même
          rangée ont la même hauteur, mais leur contenu n'a pas la même longueur — sans
          ça, une fiche sans tag remonte ses barres et son auteur d'une rangée entière
          par rapport à sa voisine. */}
      <div className="mt-auto flex flex-col gap-[10px]">
        <MiniBarChart values={mod.voteHistory} dimmed={mod.totalVotes === 0} />
        <div className="flex items-center justify-between border-t border-[var(--color-border-hairline)] pt-[9px]">
          <span className="flex items-center gap-[6px] font-mono text-[10px] text-[var(--color-text-muted)]">
            <UserAvatar src={mod.authorAvatarUrl} name={mod.author} size={16} />
            {mod.author} · {mod.ageLabel}
          </span>
          {isEngaged && (
            <button
              type="button"
              onClick={toggle}
              aria-pressed={hasVoted}
              aria-busy={isPending}
              aria-label={
                hasVoted ? `Retirer mon vote pour ${mod.name}` : `Voter pour ${mod.name}`
              }
              className={`flex items-center gap-[6px] rounded-sm px-[9px] py-[5px] font-mono text-xs ${
                hasVoted
                  ? "btn-solid bg-[var(--color-emphasis-bg)] text-[var(--color-emphasis-text)]"
                  : "btn-outline border border-[var(--color-border-strong)] text-[var(--color-foreground)]"
              }`}
              style={{ opacity: isPending ? 0.6 : 1 }}
            >
              {hasVoted && <span className="font-sans text-[10px] font-semibold">+1</span>}
              <span>{String(soireeVotes).padStart(2, "0")}</span>
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="font-mono text-[10px] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </article>
  );
}
