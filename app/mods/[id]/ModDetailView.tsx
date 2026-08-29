"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { BreadcrumbHeader } from "@/components/BreadcrumbHeader";
import { DashedAddChip } from "@/components/DashedAddChip";
import { DeleteModButton } from "@/components/DeleteModButton";
import { MiniBarChart } from "@/components/MiniBarChart";
import { ProgressBar } from "@/components/ProgressBar";
import { TagPill } from "@/components/TagPill";
import { TypeBadge } from "@/components/TypeBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { currentSession, type Mod } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

interface ModDetailViewProps {
  /** Chargé côté serveur : depuis la base, ou à défaut depuis les données mock. */
  mod: Mod | undefined;
  /**
   * Lien vers le formulaire d'édition (US-B3). Absent pour les fiches de
   * démonstration, qui ne vivent qu'en dur et n'ont rien à éditer.
   */
  editHref?: string;
  /** Vrai si le membre connecté est l'auteur de la fiche, ou un admin (US-B4). */
  canDelete?: boolean;
}

const TYPE_PLURAL = { vehicule: "Véhicules", circuit: "Circuits" } as const;

export function ModDetailView({ mod, editHref, canDelete = false }: ModDetailViewProps) {
  const { session, isLoading } = useRequireAuth();
  const [voted, setVoted] = useState(false);

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  if (!mod) {
    return (
      <div className="flex min-h-screen flex-col">
        <BreadcrumbHeader crumbs={[{ label: "Catalogue", href: "/catalogue" }, { label: "Fiche introuvable" }]} />
        <div className="p-8">
          <p className="font-sans text-sm">Cette fiche n&apos;existe pas ou a été supprimée.</p>
          <Link href="/catalogue" className="mt-3 inline-block font-sans text-sm text-[var(--color-link)]">
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  const engaged = currentSession.engagedMods.find((entry) => entry.modId === mod.id);
  const sessionVotes = (engaged?.sessionVotes ?? 0) + (voted ? 1 : 0);
  const lastContribution = mod.contributions?.[0];
  // Mock authors have no avatar of their own; only the signed-in member does.
  const authorImage = session?.user?.name === mod.author ? session.user.image : null;

  return (
    <div className="flex min-h-screen flex-col">
      <BreadcrumbHeader
        crumbs={[
          { label: "Catalogue", href: "/catalogue" },
          { label: TYPE_PLURAL[mod.type], href: "/catalogue" },
          { label: mod.name },
        ]}
        actions={
          <Link
            href="/mods/nouveau"
            className="rounded-sm px-[14px] py-2 font-sans text-xs font-semibold"
            style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
          >
            Proposer un mod
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-[18px] p-[20px] lg:grid-cols-[1fr_336px]">
        <div className="flex flex-col gap-[14px]">
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="p-5 pb-4">
              <div className="flex items-center gap-[9px]">
                <TypeBadge type={mod.type} as="pill" />
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  fiche #{mod.id.slice(0, 3).toUpperCase()} · créée le {mod.createdAtLabel}
                </span>
              </div>
              <h1 className="mt-[10px] text-pretty font-sans text-[32px] font-bold leading-[1.05] tracking-[-0.03em]">
                {mod.name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-[5px]">
                {mod.tags.map((tag) => (
                  <TagPill key={tag} label={tag} href={`/catalogue?tags=${tag}`} />
                ))}
                {/* Les tags s'ajoutent depuis le formulaire, qui porte déjà
                    l'autocomplétion (US-C1) — inutile d'en avoir deux. */}
                {editHref && <DashedAddChip label="+ ajouter un tag" href={editHref} />}
              </div>
            </div>
            <div
              className="relative flex items-end justify-between overflow-hidden border-y border-[var(--color-border)] px-[14px] py-[10px]"
              style={{
                height: 250,
                backgroundImage: mod.imageUrl
                  ? undefined
                  : "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 7px, var(--color-placeholder-b) 7px 14px)",
              }}
            >
              {mod.imageUrl ? (
                <Image
                  src={mod.imageUrl}
                  alt={`Aperçu de ${mod.name}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 700px"
                  className="object-cover"
                />
              ) : (
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  aperçu du mod — image déposée par un membre
                </span>
              )}
              {editHref && (
                <Link
                  href={editHref}
                  className="relative ml-auto rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-secondary)]"
                >
                  remplacer l&apos;image
                </Link>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  DESCRIPTION
                </div>
                {editHref && (
                  <Link href={editHref} className="border-b font-mono text-[10px] text-[var(--color-link)]" style={{ borderColor: "var(--color-amber)" }}>
                    modifier
                  </Link>
                )}
              </div>
              <p className="mt-[9px] max-w-[640px] text-pretty font-sans text-sm leading-[1.65] text-[var(--color-text-secondary)]">
                {mod.description ?? "Pas encore de description — n'importe quel membre peut en ajouter une."}
              </p>
              <div className="mt-[14px] flex flex-wrap gap-2 border-t border-[var(--color-border-hairline)] pt-[14px]">
                {mod.primaryLink && (
                  <div className="flex min-w-[150px] flex-col gap-[3px] rounded-sm border border-[var(--color-border)] px-3 py-[9px]">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
                      LIEN PRINCIPAL
                    </span>
                    <span className="font-mono text-[11px]">{mod.primaryLink.url}</span>
                  </div>
                )}
                {mod.altLinks?.map((link) => (
                  <div key={link.url} className="flex min-w-[150px] flex-col gap-[3px] rounded-sm border border-[var(--color-border)] px-3 py-[9px]">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
                      {link.label.toUpperCase()}
                    </span>
                    <span className="font-mono text-[11px]">{link.url}</span>
                  </div>
                ))}
                <DashedAddChip label="+ lien" />
              </div>
            </div>
          </div>

          {mod.contributions && mod.contributions.length > 0 && (
            <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  CONTRIBUTIONS · {mod.contributions.length}
                </div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  tout le monde peut corriger cette fiche
                </div>
              </div>
              <div className="mt-3 flex flex-col">
                {mod.contributions.map((entry, index) => (
                  <div
                    key={`${entry.author}-${index}`}
                    className="grid grid-cols-[100px_1fr_92px] items-center gap-3 border-b border-[var(--color-border-hairline)] py-2 last:border-b-0"
                  >
                    <span className="font-mono text-[10px]">{entry.author}</span>
                    <span className="font-sans text-xs text-[var(--color-text-secondary)]">{entry.action}</span>
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">{entry.whenLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mod.playedAt && mod.playedAt.length > 0 && (
            <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                DÉJÀ JOUÉ LORS DE
              </div>
              <div className="mt-[11px] flex flex-wrap gap-[10px]">
                {mod.playedAt.map((entry) => (
                  <div key={entry.sessionLabel} className="rounded-sm border border-[var(--color-border)] px-3 py-[9px]">
                    <div className="font-sans text-xs font-semibold">{entry.sessionLabel}</div>
                    <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {entry.rank}
                      {entry.rank === 1 ? "er" : "e"} · {entry.votes} votes
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-sm p-[18px]" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-on-ink)]">
                  VOTES POUR LA SOIRÉE DU 4 SEPT
                </div>
                <div className="mt-1 font-mono text-4xl leading-none">{sessionVotes}</div>
              </div>
              <MiniBarChart values={mod.voteHistory} height={36} />
            </div>
            <button
              type="button"
              onClick={() => setVoted((v) => !v)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm p-3 font-sans text-sm font-semibold"
              style={{
                background: voted ? "var(--color-amber)" : "transparent",
                color: voted ? "var(--color-ink)" : "var(--color-surface)",
                border: voted ? "none" : "1px solid rgba(255,255,255,.2)",
              }}
            >
              {voted ? "✓ Tu as voté — retirer" : "+1 Voter pour ce mod"}
            </button>
            <div className="mt-3 flex items-center gap-[5px]">
              {voted && (
                <UserAvatar src={session?.user?.image} name={session?.user?.name} size={20} ring />
              )}
              <AvatarPlaceholder size={20} />
              <AvatarPlaceholder size={20} />
              <AvatarPlaceholder size={20} />
              {!voted && <AvatarPlaceholder size={20} />}
              <span className="ml-1 font-mono text-[10px] text-[var(--color-text-on-ink)]">
                + 8 autres membres
              </span>
            </div>
          </div>

          {mod.primaryLink && (
            <a
              href={mod.primaryLink.href ?? `https://${mod.primaryLink.url}`}
              target="_blank"
              rel="noreferrer noopener"

              className="flex items-center justify-between rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[15px] py-[13px]"
            >
              <span>
                <span className="block font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  TÉLÉCHARGER — LIEN EXTERNE
                </span>
                <span className="mt-[3px] block font-sans text-[13px] font-semibold">
                  {mod.primaryLink.label} ↗
                </span>
              </span>
              <span className="font-mono text-base text-[var(--color-link)]">↗</span>
            </a>
          )}

          {mod.fileUpload && (
            <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[15px]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  FICHIER SUR PADDOCK
                </span>
                <span className="px-[6px] py-[2px] font-mono text-[10px]" style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}>
                  EXPIRE DANS {mod.fileUpload.expiresInLabel.toUpperCase()}
                </span>
              </div>
              <div className="mt-2 font-sans text-[13px] font-semibold">{mod.fileUpload.filename}</div>
              <div className="mt-[2px] font-mono text-[10px] text-[var(--color-text-muted)]">
                {mod.fileUpload.sizeLabel} · {mod.fileUpload.uploadedByLabel}
              </div>
              <div className="mt-[10px]">
                <ProgressBar percent={mod.fileUpload.progressPercent} height={4} />
              </div>
              <div className="mt-3 flex gap-[7px]">
                <span
                  className="flex-1 rounded-sm py-[9px] text-center font-sans text-xs font-semibold"
                  style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
                >
                  Télécharger
                </span>
                <span className="rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[9px] font-sans text-xs font-medium">
                  Ré-uploader
                </span>
              </div>
              <div className="mt-[10px] border-t border-[var(--color-border-hairline)] pt-[10px] font-mono text-[10px] leading-[1.55] text-[var(--color-text-muted)]">
                Les fichiers déposés ici sautent 24 h après l&apos;upload, quoi qu&apos;il arrive. La
                fiche, elle, reste. Pour une soirée lointaine, garde le lien externe.
              </div>
            </div>
          )}

          <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">ACTIONS</div>
            <div className="mt-[10px] flex flex-col gap-[7px]">
              {editHref && (
                <Link
                  href={editHref}
                  className="rounded-sm border border-[var(--color-border-strong)] px-3 py-[9px] text-center font-sans text-xs font-medium"
                >
                  Modifier la fiche
                </Link>
              )}
              <span className="rounded-sm border border-[var(--color-border-strong)] px-3 py-[9px] font-sans text-xs font-medium">
                Engager dans la soirée du {currentSession.dateLabel.split(" ").slice(-2).join(" ")}
              </span>
              {canDelete ? (
                <DeleteModButton modId={mod.id} modName={mod.name} />
              ) : (
                <span
                  className="rounded-sm px-3 py-[9px] font-sans text-xs font-medium opacity-60"
                  style={{ border: "1px solid var(--color-danger)", color: "var(--color-danger-text)" }}
                >
                  Supprimer — réservé à {mod.author} &amp; admins
                </span>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-1 font-mono text-[10px] leading-[1.6] text-[var(--color-text-muted)]">
            <UserAvatar src={authorImage} name={mod.author} size={16} />
            <span>
              Auteur d&apos;origine : {mod.author}.
              {lastContribution && ` Dernière modif : ${lastContribution.author}, ${lastContribution.whenLabel}.`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
