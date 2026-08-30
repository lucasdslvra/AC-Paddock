"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EngageModPicker } from "@/components/EngageModPicker";
import { MiniBarChart } from "@/components/MiniBarChart";
import { ModThumbnail } from "@/components/ModThumbnail";
import { ProgressBar } from "@/components/ProgressBar";
import { StatBlock } from "@/components/StatBlock";
import { TagPill } from "@/components/TagPill";
import { UserAvatar } from "@/components/UserAvatar";
import { toUiModType } from "@/lib/mods/type";
import { apiModToView } from "@/lib/mods/view";
import { useVote } from "@/lib/mods/useVote";
import { formatSoireeCountdown, formatSoireeDate } from "@/lib/soirees/format";
import type { ApiSoiree, ApiSoireeMod } from "@/lib/soirees/serialize";
import { useRequireAuth } from "@/lib/useRequireAuth";

interface SoireeViewProps {
  /** `null` quand aucune soirée n'est programmée (cf. `currentSoiree`). */
  soiree: ApiSoiree | null;
  memberCount: number;
  /**
   * Le rôle n'est jamais dans la session — il est relu en base à chaque écriture, pour
   * qu'une session ouverte avant un changement de rôle ne garde pas d'anciens droits.
   * La page serveur le transmet donc ici, et il ne sert qu'à peindre le bouton :
   * `DELETE /api/soirees/[id]/mods/[modId]` revérifie de son côté.
   */
  isAdmin?: boolean;
}

/**
 * Une ligne du classement (US-G3, US-G4).
 *
 * Le compteur affiché est celui de la **soirée**, pas le total de la fiche : c'est ce
 * qui décide du classement de ce soir. `useVote` suit les deux, la carte du catalogue
 * affichant l'autre.
 */
function RankingRow({
  entry,
  rank,
  soireeId,
  canRemove,
  onChanged,
}: {
  entry: ApiSoireeMod;
  rank: number;
  soireeId: string;
  canRemove: boolean;
  onChanged: () => void;
}) {
  const { soireeVotes, hasVoted, isPending, error, toggle } = useVote(entry.mod.id, {
    votes: entry.mod.votes,
    soireeVotes: entry.votes,
    hasVoted: entry.hasVoted,
  });
  // `ApiMod.voteHistory` porte des comptes bruts ; c'est `apiModToView` qui sait les
  // traduire en hauteurs de barres, et la ligne s'appuie sur lui plutôt que de refaire
  // le calcul dans son coin.
  const history = apiModToView(entry.mod).voteHistory;
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove() {
    setIsRemoving(true);
    setRemoveError(null);
    try {
      const response = await fetch(`/api/soirees/${soireeId}/mods/${entry.mod.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setRemoveError(body?.error ?? "Ce mod n'a pas pu être retiré.");
        return;
      }
      onChanged();
    } catch {
      setRemoveError("Impossible de joindre le serveur.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <article
      className="grid grid-cols-[38px_48px_1fr_auto] items-center gap-[13px] rounded-sm border p-[11px_14px] md:grid-cols-[38px_48px_1fr_110px_auto]"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        // Le premier du classement porte un liseré : c'est le mod qu'on installera.
        borderLeft: rank === 1 ? "3px solid var(--color-amber)" : undefined,
      }}
    >
      <div className="font-mono text-xl leading-none">{String(rank).padStart(2, "0")}</div>
      <ModThumbnail src={entry.mod.imageUrl ?? undefined} name={entry.mod.name} size={42} />
      <div className="min-w-0">
        <Link
          href={`/mods/${entry.mod.id}`}
          className="link-title font-sans text-[15px] font-semibold leading-tight"
        >
          {entry.mod.name}
        </Link>
        <div className="mt-[3px] flex flex-wrap items-center gap-[5px] font-mono text-[9.5px] text-[var(--color-text-muted)]">
          <span>{toUiModType(entry.mod.type) === "vehicule" ? "véhicule" : "circuit"}</span>
          {entry.mod.tags.map((tag) => (
            <TagPill key={tag} label={tag} href={`/catalogue?tags=${tag}`} />
          ))}
          <span className="flex items-center gap-[5px]">
            <UserAvatar src={entry.engagedBy.avatarUrl} name={entry.engagedBy.username} size={14} />
            engagé par {entry.engagedBy.username}
          </span>
        </div>
        {(error ?? removeError) && (
          <p role="alert" className="mt-1 font-mono text-[10px] text-[var(--color-danger-text)]">
            {error ?? removeError}
          </p>
        )}
      </div>
      {/* US-G4 — les soirées précédentes de ce mod : le score de ce soir repart de zéro,
          ces barres disent s'il a déjà convaincu. */}
      <div className="hidden w-[110px] md:block">
        <MiniBarChart values={history} height={26} dimmed={soireeVotes === 0} />
      </div>
      <div className="flex items-center gap-[9px]">
        {canRemove && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={isRemoving}
            title="Retirer ce mod de la soirée — ses votes partent avec lui."
            className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[8px] py-[6px] font-mono text-[10px] text-[var(--color-text-secondary)] disabled:opacity-50"
          >
            retirer
          </button>
        )}
        <span className="font-mono text-xl">{soireeVotes}</span>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hasVoted}
          aria-busy={isPending}
          aria-label={
            hasVoted ? `Retirer mon vote pour ${entry.mod.name}` : `Voter pour ${entry.mod.name}`
          }
          className={`rounded-sm px-[11px] py-[7px] font-sans text-xs font-semibold ${
            hasVoted
              ? "btn-solid bg-[var(--color-amber)] text-[var(--color-ink)]"
              : "btn-outline border border-[var(--color-border-strong)]"
          }`}
          style={{ opacity: isPending ? 0.7 : 1 }}
        >
          {hasVoted ? "✓ voté" : "+1"}
        </button>
      </div>
    </article>
  );
}

export function SoireeView({ soiree: initialSoiree, memberCount, isAdmin = false }: SoireeViewProps) {
  const { isLoading } = useRequireAuth();
  const { data: session } = useSession();
  const [soiree, setSoiree] = useState(initialSoiree);

  /**
   * Recharge la soirée après une écriture. Le classement est trié par la base (US-G4) :
   * le refaire ici donnerait le même ordre, mais un vote parti d'un autre membre
   * n'apparaîtrait jamais. Les compteurs, eux, bougent tout de suite côté navigateur —
   * c'est `useVote` qui s'en charge, ce rechargement ne fait que remettre les lignes
   * dans l'ordre.
   */
  const refresh = useCallback(() => {
    if (!soiree) return;
    void fetch(`/api/soirees/${soiree.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ApiSoiree | null) => body && setSoiree(body))
      .catch(() => {});
  }, [soiree]);

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  // US-G1 — rien n'est programmé. Dire pourquoi, et où ça se crée : sans ça, la page
  // vide se lit comme une panne, et le vote éteint partout ailleurs reste inexpliqué.
  if (!soiree) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader active="soiree" />
        <div className="p-8">
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            SOIRÉE EN COURS
          </div>
          <h1 className="mt-2 font-sans text-[32px] font-bold leading-none tracking-[-0.035em]">
            Aucune soirée n&apos;est programmée.
          </h1>
          <p className="mt-3 max-w-[520px] font-mono text-[11.5px] leading-[1.7] text-[var(--color-text-secondary)]">
            Le vote n&apos;existe que dans le cadre d&apos;une soirée : tant qu&apos;aucune
            n&apos;est ouverte, les boutons du catalogue et des fiches restent éteints.
            Un admin en crée une depuis l&apos;espace admin, puis chacun y engage les mods
            qu&apos;il veut essayer.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/catalogue"
              className="btn-solid rounded-sm px-[14px] py-2 font-sans text-xs font-semibold"
              style={{ background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }}
            >
              Retour au catalogue
            </Link>
            <Link
              href="/admin"
              className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[14px] py-2 font-sans text-xs font-medium"
            >
              Espace admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const date = new Date(soiree.date);
  const myVoteCount = soiree.mods.filter((entry) => entry.hasVoted).length;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="soiree" cta={{ label: "Proposer un mod", href: "/mods/nouveau" }} />

      <div className="flex flex-wrap items-end gap-7 border-b border-[var(--color-border)] px-[22px] py-[18px]">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            SOIRÉE EN COURS{soiree.name && ` · THÈME ${soiree.name.toUpperCase()}`}
          </div>
          <h1 className="mt-2 font-sans text-[38px] font-bold leading-none tracking-[-0.035em]">
            {formatSoireeDate(date)}
          </h1>
          <div className="mt-[7px] font-mono text-[11px] text-[var(--color-text-secondary)]">
            créée par {soiree.createdBy.username} · {soiree.mods.length} mod
            {soiree.mods.length > 1 ? "s" : ""} engagé{soiree.mods.length > 1 ? "s" : ""}
          </div>
        </div>
        <div className="ml-auto flex items-end gap-[26px]">
          <StatBlock label="IL RESTE" value={formatSoireeCountdown(date)} valueSize={22} />
          <StatBlock
            label="ONT VOTÉ"
            value={`${soiree.voterCount} / ${memberCount}`}
            valueSize={26}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[18px] p-[18px] lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-[10px] flex items-baseline justify-between">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              CLASSEMENT EN DIRECT
            </div>
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
              mise à jour à chaque vote
            </div>
          </div>

          {soiree.mods.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
              <p className="font-sans text-sm font-semibold">Personne n&apos;a encore engagé de mod.</p>
              <p className="mt-[6px] font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
                Seuls les mods engagés ici sont votables. Prends-en un dans le catalogue,
                à droite.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-[7px]">
              {soiree.mods.map((entry, index) => (
                <RankingRow
                  key={entry.id}
                  entry={entry}
                  rank={index + 1}
                  soireeId={soiree.id}
                  // Cahier §2.6, même règle que la suppression d'une fiche : celui qui a
                  // engagé le mod, ou un admin. Sinon n'importe qui effacerait les votes
                  // des autres d'un clic.
                  canRemove={
                    isAdmin || entry.engagedBy.discordId === session?.user?.id
                  }
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <EngageModPicker soireeId={soiree.id} onEngaged={refresh} />

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TON VOTE
            </div>
            <div className="mt-2 font-mono text-[11.5px] leading-[1.7] text-[var(--color-text-secondary)]">
              Tu as voté pour {myVoteCount} mod{myVoteCount > 1 ? "s" : ""} sur{" "}
              {soiree.mods.length}. Un vote par mod, tu peux le retirer à tout moment.
            </div>
            <div className="mt-[10px]">
              <ProgressBar
                percent={
                  soiree.mods.length === 0 ? 0 : (myVoteCount / soiree.mods.length) * 100
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
