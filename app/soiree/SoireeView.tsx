"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { EngageModPicker } from "@/components/EngageModPicker";
import {
  SoireeDownloadPanel,
  type SoireeDownloadItem,
} from "@/components/SoireeDownloadPanel";
import { MiniBarChart } from "@/components/MiniBarChart";
import { ModThumbnail } from "@/components/ModThumbnail";
import { ProgressBar } from "@/components/ProgressBar";
import { StatBlock } from "@/components/StatBlock";
import { TagPill } from "@/components/TagPill";
import { UserAvatar } from "@/components/UserAvatar";
import type { ModType } from "@/lib/generated/prisma/enums";
import { MOD_TYPES, toUiModType } from "@/lib/mods/type";
import { apiModToView } from "@/lib/mods/view";
import { useVote } from "@/lib/mods/useVote";
import { formatSoireeCountdown, formatSoireeDate, formatSoireeTime } from "@/lib/soirees/format";
import { downloadClosesAt, soireePhase, voteClosesAt } from "@/lib/soirees/phase";
import {
  hasTieAtCut,
  modTypePlural,
  quotaReachedMessage,
  rankSection,
  RETAINED_COUNT,
  VOTE_QUOTA,
  type Ranked,
} from "@/lib/soirees/quota";
import { PageLoader } from "@/components/PageLoader";
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
  /**
   * US-I2 — la soirée a déjà eu lieu. Calculé côté serveur (`startOfToday`) et non ici :
   * comparer à `new Date()` dans le rendu ferait diverger le HTML du serveur de celui du
   * navigateur au passage de minuit.
   *
   * Distinct de la lecture seule, qui découle de `soiree.isCurrent` : une soirée
   * programmée plus loin que la prochaine n'est ni passée ni ouverte au vote.
   */
  isPast?: boolean;
  /**
   * L'instant du rendu serveur, en ISO. La page a une horloge — le vote ferme 30 min
   * avant le départ, le retrait deux heures après — et `new Date()` au premier rendu
   * client donnerait un HTML différent de celui du serveur. Il part donc du serveur,
   * puis la page prend le relais toute seule (`CLOCK_TICK_MS`).
   */
  now?: string;
}

/** À quelle cadence la page relit l'heure : assez fin pour que la bascule se voie. */
const CLOCK_TICK_MS = 15_000;

/** « VÉHICULES » / « CIRCUITS » — l'en-tête d'un des deux classements. */
const SECTION_LABEL: Record<ModType, string> = { CAR: "VÉHICULES", TRACK: "CIRCUITS" };

/** Les engagements pour lesquels ce membre a voté, par identifiant d'engagement. */
function votedIdsOf(soiree: ApiSoiree | null): ReadonlySet<string> {
  return new Set(soiree?.mods.filter((entry) => entry.hasVoted).map((entry) => entry.id) ?? []);
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
  retained,
  soireeId,
  canRemove,
  readOnly,
  quotaReached,
  onVoteChange,
  onChanged,
}: {
  entry: ApiSoireeMod;
  rank: number;
  /** Ce mod fait partie de ce que la soirée garde, au score de l'instant. */
  retained: boolean;
  soireeId: string;
  canRemove: boolean;
  /** US-I2 — la soirée n'est plus celle en cours : la ligne devient un résultat. */
  readOnly: boolean;
  /**
   * Le quota de ce type est plein et ce mod n'en fait pas partie : le bouton reste
   * visible mais éteint, avec la raison. Un vote déjà placé se retire toujours — c'est
   * même la seule façon d'en libérer un.
   */
  quotaReached: boolean;
  onVoteChange: (engagementId: string, hasVoted: boolean) => void;
  onChanged: () => void;
}) {
  // Le vote vit dans cette ligne, le quota se compte sur toute la soirée : la page a
  // besoin d'être prévenue à chaque bascule, y compris optimiste.
  const reportVote = useCallback(
    (hasVoted: boolean) => onVoteChange(entry.id, hasVoted),
    [entry.id, onVoteChange],
  );
  // `useVote` est appelé même en lecture seule — un hook ne peut pas l'être sous
  // condition. Il ne coûte alors qu'un état local jamais touché : rien ne l'appelle,
  // puisque le bouton n'est pas peint.
  const { soireeVotes, hasVoted, isPending, error, toggle } = useVote(
    entry.mod.id,
    {
      votes: entry.mod.votes,
      soireeVotes: entry.votes,
      hasVoted: entry.hasVoted,
    },
    reportVote,
  );
  // `ApiMod.voteHistory` porte des comptes bruts ; c'est `apiModToView` qui sait les
  // traduire en hauteurs de barres, et la ligne s'appuie sur lui plutôt que de refaire
  // le calcul dans son coin.
  const history = apiModToView(entry.mod).voteHistory;
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Le quota ne ferme jamais un vote déjà placé : le retirer est ce qui rend la main.
  const isBlocked = quotaReached && !hasVoted;

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
      // Sur un téléphone, le rang, la vignette et le nom tiennent la première ligne, et
      // les actions passent dessous (`col-span-3` plus bas) : côte à côte, « retirer »
      // et le bouton de vote ne laissaient qu'une poignée de pixels au nom du mod, qui
      // est pourtant ce qu'on vient lire.
      className="grid grid-cols-[30px_44px_1fr] items-center gap-x-[10px] gap-y-[9px] rounded-sm border p-[11px_12px] md:grid-cols-[38px_48px_1fr_110px_auto] md:gap-[13px] md:p-[11px_14px]"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        // Le liseré marque ce que la soirée garde : les huit véhicules et le circuit
        // les plus votés (`RETAINED_COUNT`). Sur la soirée en cours il se déplace au fil
        // des votes — c'est une projection, pas encore un résultat.
        borderLeft: retained ? "3px solid var(--color-amber)" : undefined,
      }}
    >
      <div className="font-mono text-lg leading-none md:text-xl">{String(rank).padStart(2, "0")}</div>
      <ModThumbnail src={entry.mod.imageUrl ?? undefined} name={entry.mod.name} size={42} />
      <div className="min-w-0">
        <Link
          href={`/mods/${entry.mod.id}`}
          className="link-title font-sans text-[15px] font-semibold leading-tight"
        >
          {entry.mod.name}
        </Link>
        <div className="mt-[3px] flex flex-wrap items-center gap-[5px] font-mono text-[9.5px] text-[var(--color-text-muted)]">
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
      <div className="col-span-3 flex items-center justify-end gap-[9px] md:col-span-1">
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
        {!readOnly && (
          <button
            type="button"
            onClick={toggle}
            disabled={isBlocked}
            aria-pressed={hasVoted}
            aria-busy={isPending}
            // Le bouton éteint n'est pas une panne : la phrase dit pourquoi, et qu'il y
            // a quelque chose à faire — retirer un vote ailleurs.
            title={isBlocked ? quotaReachedMessage(entry.mod.type) : undefined}
            aria-label={
              hasVoted ? `Retirer mon vote pour ${entry.mod.name}` : `Voter pour ${entry.mod.name}`
            }
            className={`rounded-sm px-[11px] py-[7px] font-sans text-xs font-semibold ${
              hasVoted
                ? "btn-solid bg-[var(--color-amber)] text-[var(--color-ink)]"
                : "btn-outline border border-[var(--color-border-strong)]"
            } ${isBlocked ? "cursor-not-allowed" : ""}`}
            style={{ opacity: isPending ? 0.7 : isBlocked ? 0.35 : 1 }}
          >
            {hasVoted ? "✓ voté" : "+1"}
          </button>
        )}
        {/* Le vote du membre reste lisible une fois les votes clos : c'est le seul
            repère qui distingue « je n'ai pas aimé » de « je n'étais pas là ». */}
        {readOnly && entry.hasVoted && (
          <span
            className="font-mono text-[10px] text-[var(--color-text-muted)]"
            title="Tu avais voté pour ce mod."
          >
            ✓ voté
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * Un des deux classements de la soirée : les véhicules, ou les circuits.
 *
 * Ils sont séparés parce qu'ils ne se jouent pas l'un contre l'autre — la soirée garde
 * huit voitures **et** un circuit, et chacun vote pour les deux avec deux réserves
 * distinctes (`VOTE_QUOTA`). Un classement unique ferait disputer au circuit une place
 * de voiture, qu'il ne pourrait de toute façon pas prendre.
 */
function RankingSection({
  type,
  rows,
  used,
  soireeId,
  readOnly,
  isAdmin,
  viewerDiscordId,
  onVoteChange,
  onChanged,
}: {
  type: ModType;
  rows: Ranked<ApiSoireeMod>[];
  /** Combien de votes de ce type ce membre a déjà placés ce soir. */
  used: number;
  soireeId: string;
  readOnly: boolean;
  isAdmin: boolean;
  viewerDiscordId?: string | null;
  onVoteChange: (engagementId: string, hasVoted: boolean) => void;
  onChanged: () => void;
}) {
  const quota = VOTE_QUOTA[type];
  const kept = RETAINED_COUNT[type];
  const quotaReached = used >= quota;
  // Une égalité pile à la barre, le vote encore ouvert : la dernière place n'est pas
  // encore prise, elle se tirera au sort à la fermeture (`drawTieBreaks`). Sans cette
  // mention, deux mods à égalité se liraient comme un classement acquis.
  const tieAtCut = !readOnly && hasTieAtCut(rows);
  // La barre se pose sous le dernier retenu, et non à la place fixe : un mod sans vote
  // n'est pas retenu, même quand il reste de la place (`isRetained`).
  const lastRetained = rows.reduce((last, row, index) => (row.retained ? index : last), -1);

  return (
    <section>
      <div className="mb-[10px] flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-hairline)] pb-[6px]">
        <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          {SECTION_LABEL[type]} · {rows.length} engagé{rows.length > 1 ? "s" : ""} ·{" "}
          {kept > 1 ? `${kept} retenus` : "1 retenu"}
        </div>
        {!readOnly && (
          <div
            className="font-mono text-[10px]"
            style={{
              color: quotaReached ? "var(--color-amber)" : "var(--color-text-muted)",
            }}
          >
            tes votes {used}/{quota}
            {quotaReached && " · réserve épuisée"}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-[14px] text-center font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
          {readOnly
            ? `Aucun ${type === "CAR" ? "véhicule" : "circuit"} n'a été engagé.`
            : `Aucun ${type === "CAR" ? "véhicule" : "circuit"} engagé pour l'instant — prends-en un dans le catalogue, à droite.`}
        </div>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {rows.map((row, index) => (
            <div key={row.entry.id} className="flex flex-col gap-[7px]">
              <RankingRow
                entry={row.entry}
                rank={row.rank}
                retained={row.retained}
                soireeId={soireeId}
                // Cahier §2.6, même règle que la suppression d'une fiche : celui qui a
                // engagé le mod, ou un admin. Sinon n'importe qui effacerait les votes
                // des autres d'un clic.
                // Rien ne se retire d'une soirée qu'on ne fait plus que lire : le
                // retrait emporte les votes reçus, et ceux-là sont le compte rendu.
                canRemove={
                  !readOnly && (isAdmin || row.entry.engagedBy.discordId === viewerDiscordId)
                }
                readOnly={readOnly}
                quotaReached={quotaReached}
                onVoteChange={onVoteChange}
                onChanged={onChanged}
              />
              {/* La ligne de coupe : au-dessus, ce que la soirée garde. Elle ne s'affiche
                  que s'il y a quelque chose en dessous — sinon elle ne sépare rien. */}
              {index === lastRetained && index < rows.length - 1 && (
                <div
                  className="flex items-center gap-[9px] font-mono text-[9.5px] tracking-[0.1em] text-[var(--color-text-faint)]"
                  aria-hidden
                >
                  <span className="h-px flex-1" style={{ background: "var(--color-amber)" }} />
                  {readOnly ? "NON RETENUS" : "SOUS LA BARRE"}
                  <span className="h-px flex-1" style={{ background: "var(--color-border)" }} />
                </div>
              )}
              {/* Pas `aria-hidden`, contrairement à la barre : celle-ci se voit, cette
                  phrase-là s'écoute — elle dit pourquoi deux mods à égalité ne sont pas
                  du même côté. */}
              {index === lastRetained && tieAtCut && (
                <p className="text-center font-mono text-[9.5px] leading-[1.6] tracking-[0.06em] text-[var(--color-text-faint)]">
                  égalité à la barre · la place se tire au sort à la fermeture du vote
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SoireeView({
  soiree: initialSoiree,
  memberCount,
  isAdmin = false,
  isPast = false,
  now: serverNow,
}: SoireeViewProps) {
  const { isLoading } = useRequireAuth();
  const { data: session } = useSession();
  const [soiree, setSoiree] = useState(initialSoiree);
  // Part de l'heure du serveur pour que le premier rendu client soit le même, puis suit
  // l'horloge du navigateur : la fermeture du vote et l'ouverture du retrait se voient
  // sans rechargement.
  const [now, setNow] = useState(() => (serverNow ? new Date(serverNow) : new Date()));
  /**
   * Les engagements pour lesquels ce membre a voté, tenus au niveau de la page.
   *
   * Le vote se clique dans une ligne, mais le quota se compte sur toute la soirée : sans
   * cet état commun, les compteurs « 6/8 » et les boutons éteints ne bougeraient qu'au
   * rechargement suivant, alors que le bouton, lui, répond au doigt.
   */
  const [votedIds, setVotedIds] = useState<ReadonlySet<string>>(() => votedIdsOf(initialSoiree));

  /**
   * Recharge la soirée après une écriture — un engagement, un retrait. Les votes, eux,
   * n'ont pas besoin d'elle : le classement est refait ici à chaque bascule
   * (`rankSection`), à partir des scores tenus par l'interface. Ce rechargement sert à
   * faire entrer ce que les **autres** ont fait.
   */
  const refresh = useCallback(() => {
    if (!soiree) return;
    void fetch(`/api/soirees/${soiree.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ApiSoiree | null) => {
        if (!body) return;
        setSoiree(body);
        // La base fait foi de nouveau : ce que le serveur dit de mes votes remplace ce
        // que la page en avait retenu.
        setVotedIds(votedIdsOf(body));
      })
      .catch(() => {});
  }, [soiree]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const handleVoteChange = useCallback((engagementId: string, hasVoted: boolean) => {
    setVotedIds((previous) => {
      if (previous.has(engagementId) === hasVoted) return previous;
      const next = new Set(previous);
      if (hasVoted) next.add(engagementId);
      else next.delete(engagementId);
      return next;
    });
  }, []);

  /**
   * Le score de ce soir tel que l'interface le connaît : celui du serveur, corrigé du
   * seul vote que la page peut avoir changé depuis — celui de ce membre. Les votes des
   * autres n'arrivent qu'au rechargement, comme le compteur des lignes.
   */
  const liveVotes = useCallback(
    (entry: ApiSoireeMod) =>
      entry.votes + (votedIds.has(entry.id) ? 1 : 0) - (entry.hasVoted ? 1 : 0),
    [votedIds],
  );

  const sections = useMemo(
    () =>
      MOD_TYPES.map((type) => ({
        type,
        rows: rankSection(soiree?.mods ?? [], type, (entry) => ({
          type: entry.mod.type,
          votes: liveVotes(entry),
          // Le tirage vient du serveur, et vaut `null` tant que le vote est ouvert :
          // la page ne tire jamais au sort elle-même, elle lit ce qui a été tiré à la
          // fermeture — sinon elle ne retiendrait pas les mêmes mods que la liste de
          // retrait.
          tieBreak: entry.tieBreak,
          engagedAt: entry.engagedAt,
        })),
      })),
    [liveVotes, soiree],
  );

  /** Les votes placés par ce membre, par type — le numérateur des quotas. */
  const used = useMemo(() => {
    const tally: Record<ModType, number> = { CAR: 0, TRACK: 0 };
    for (const entry of soiree?.mods ?? []) {
      if (votedIds.has(entry.id)) tally[entry.mod.type] += 1;
    }
    return tally;
  }, [soiree, votedIds]);

  if (isLoading) {
    return <PageLoader />;
  }

  // US-G1 — rien n'est programmé. Dire pourquoi, et où ça se crée : sans ça, la page
  // vide se lit comme une panne, et le vote éteint partout ailleurs reste inexpliqué.
  if (!soiree) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppHeader active="soiree" />
        <div className="p-4 sm:p-8">
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            SOIRÉE EN COURS
          </div>
          <h1 className="mt-2 text-pretty font-sans text-[26px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[32px] sm:leading-none">
            Aucune soirée n&apos;est programmée.
          </h1>
          <p className="mt-3 max-w-[520px] font-mono text-[11.5px] leading-[1.7] text-[var(--color-text-secondary)]">
            Le vote n&apos;existe que dans le cadre d&apos;une soirée : tant qu&apos;aucune
            n&apos;est ouverte, les boutons du catalogue et des fiches restent éteints.
            Un admin en crée une depuis l&apos;espace admin, puis chacun y engage les mods
            qu&apos;il veut essayer.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
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
  // Où en est la soirée : on vote, le classement est figé et les mods se retirent, ou
  // c'est fini (lib/soirees/phase.ts). Le serveur applique exactement les mêmes bornes.
  const phase = soireePhase(date, now);
  const voteCloseLabel = formatSoireeTime(voteClosesAt(date));

  /**
   * US-I2 — hors de la soirée en cours, la page est un compte rendu : ni vote, ni
   * engagement, ni retrait de mod. La condition tenait à `isCurrent` et non à `isPast`,
   * parce que le serveur refuse déjà d'écrire ailleurs que dans la soirée en cours —
   * une soirée programmée plus loin est donc à lire, elle aussi.
   *
   * S'y ajoute la fermeture du vote, 30 min avant le départ : la soirée reste « en
   * cours » toute la journée, mais son classement est figé bien avant. La page bascule
   * alors d'elle-même, sans rechargement — c'est l'horloge qui la fait tourner.
   */
  const isReadOnly = !soiree.isCurrent || phase !== "OPEN";
  // Ce que la soirée garde, les deux classements réunis : huit véhicules, un circuit.
  // Le circuit en tête : il n'y en a qu'un, et c'est la première chose qu'on cherche en
  // relisant une soirée — au bout d'une liste de huit voitures, il se manquerait.
  const retained = [...sections]
    .reverse()
    .flatMap((section) => section.rows.filter((row) => row.retained));
  const counts = Object.fromEntries(
    sections.map((section) => [section.type, section.rows.length]),
  ) as Record<ModType, number>;
  /**
   * Ce que le bouton de retrait va chercher : le fichier déposé quand il y en a un et
   * qu'il n'a pas expiré (cahier §2.7), le lien externe de la fiche à défaut. C'est
   * `apiModToView` qui sait lire l'un et l'autre — la même lecture que le panneau
   * « fichier » de la fiche.
   */
  const downloadItems: SoireeDownloadItem[] = retained.map((row) => {
    const file = apiModToView(row.entry.mod).fileUpload;
    return {
      modId: row.entry.mod.id,
      name: row.entry.mod.name,
      type: row.entry.mod.type,
      file: file?.href && !file.expired ? { filename: file.filename, href: file.href } : null,
      href: row.entry.mod.url,
    };
  });

  const eyebrow = soiree.isCurrent
    ? "SOIRÉE EN COURS"
    : isPast
      ? "SOIRÉE PASSÉE"
      : "SOIRÉE À VENIR";

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        active={isPast ? "historique" : "soiree"}
        cta={isReadOnly ? undefined : { label: "Proposer un mod", href: "/mods/nouveau" }}
      />

      <div className="flex flex-wrap items-end gap-x-7 gap-y-4 border-b border-[var(--color-border)] px-4 py-4 sm:px-[22px] sm:py-[18px]">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            {eyebrow}
            {soiree.name && ` · THÈME ${soiree.name.toUpperCase()}`}
          </div>
          <h1 className="mt-2 text-pretty font-sans text-[26px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[38px] sm:leading-none">
            {formatSoireeDate(date)}
          </h1>
          <div className="mt-[7px] font-mono text-[11px] text-[var(--color-text-secondary)]">
            créée par {soiree.createdBy.username} · {counts.CAR} véhicule
            {counts.CAR > 1 ? "s" : ""} et {counts.TRACK} circuit
            {counts.TRACK > 1 ? "s" : ""} engagé{soiree.mods.length > 1 ? "s" : ""}
          </div>
        </div>
        {/* Les trois compteurs prennent toute la largeur sous `sm` : serrés contre le
            bord droit d'un téléphone, ils passeraient à la ligne un par un. */}
        <div className="flex w-full items-end justify-between gap-4 sm:ml-auto sm:w-auto sm:justify-start sm:gap-[26px]">
          <StatBlock
            label={isPast ? "STATUT" : "IL RESTE"}
            value={isPast ? "terminée" : formatSoireeCountdown(date)}
            valueSize={22}
          />
          {/* Le vote ne va pas jusqu'au départ : il ferme 30 min avant, pour laisser
              le temps d'installer ce qui a été retenu. L'heure est écrite, pas
              seulement « ouvert » — c'est elle qu'on regarde en fin d'après-midi. */}
          {!isPast && (
            <StatBlock
              label="VOTE"
              value={phase === "OPEN" ? `→ ${voteCloseLabel}` : `clos ${voteCloseLabel}`}
              valueSize={22}
            />
          )}
          <StatBlock
            label="ONT VOTÉ"
            value={`${soiree.voterCount} / ${memberCount}`}
            valueSize={26}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[18px] p-4 sm:p-[18px] lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-[10px] flex items-baseline justify-between">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              {isReadOnly ? "CLASSEMENT FINAL" : "CLASSEMENT EN DIRECT"}
            </div>
            <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
              {!isReadOnly
                ? "mise à jour à chaque vote"
                : soiree.isCurrent
                  ? `vote fermé à ${voteCloseLabel}`
                  : "les votes sont clos"}
            </div>
          </div>

          {soiree.mods.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
              <p className="font-sans text-sm font-semibold">
                {isReadOnly
                  ? "Aucun mod n'a été engagé pour cette soirée."
                  : "Personne n'a encore engagé de mod."}
              </p>
              <p className="mt-[6px] font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
                {isReadOnly
                  ? "Elle s'est jouée sans passer par le vote, ou personne n'a rien proposé à temps."
                  : "Autant de véhicules et de circuits qu'on veut : seuls les mods engagés ici sont votables. Prends-en un dans le catalogue, à droite."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-[22px]">
              {sections.map((section) => (
                // Une section vide n'apprend rien sur une soirée qu'on ne fait que lire.
                // Sur la soirée en cours, si : il manque un circuit à choisir.
                (!isReadOnly || section.rows.length > 0) && (
                  <RankingSection
                    key={section.type}
                    type={section.type}
                    rows={section.rows}
                    used={used[section.type]}
                    soireeId={soiree.id}
                    readOnly={isReadOnly}
                    isAdmin={isAdmin}
                    viewerDiscordId={session?.user?.id}
                    onVoteChange={handleVoteChange}
                    onChanged={refresh}
                  />
                )
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* US-I2 — une soirée qu'on ne fait que lire n'a rien à garnir. Passé la
              fermeture du vote non plus : le classement est figé, on télécharge. */}
          {!isReadOnly && <EngageModPicker soireeId={soiree.id} onEngaged={refresh} />}

          {/* La fenêtre de retrait : de la fermeture du vote à deux heures après le
              départ. Le bouton n'existe qu'à l'intérieur — avant, le classement peut
              encore bouger et on téléchargerait peut-être le mauvais mod ; après, les
              fichiers ont de toute façon commencé à expirer. */}
          {phase === "LOCKED" && downloadItems.length > 0 && (
            <SoireeDownloadPanel
              items={downloadItems}
              closesAtLabel={formatSoireeTime(downloadClosesAt(date))}
            />
          )}

          {/* Ce que la soirée retient, sorti de la liste : c'est la réponse à
              « qu'est-ce qui a été joué ce soir-là ? », et elle ne doit pas se
              chercher entre deux classements. */}
          {isReadOnly && retained.length > 0 && (
            <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                MODS RETENUS
              </div>
              <div className="mt-2 flex flex-col gap-[7px]">
                {retained.map((row) => (
                  <div key={row.entry.id}>
                    <Link
                      href={`/mods/${row.entry.mod.id}`}
                      className="link-title block font-sans text-[13.5px] font-semibold leading-tight"
                    >
                      {row.entry.mod.name}
                    </Link>
                    <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {toUiModType(row.entry.mod.type) === "vehicule" ? "véhicule" : "circuit"} ·{" "}
                      {row.entry.votes} vote{row.entry.votes > 1 ? "s" : ""} · engagé par{" "}
                      {row.entry.engagedBy.username}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              {isReadOnly ? "TES VOTES" : "TA RÉSERVE DE VOTES"}
            </div>
            <div className="mt-[10px] flex flex-col gap-[11px]">
              {MOD_TYPES.map((type) => (
                <div key={type}>
                  <div className="flex items-baseline justify-between font-mono text-[11px]">
                    <span className="text-[var(--color-text-secondary)]">
                      {modTypePlural(type)}
                    </span>
                    <span>
                      {used[type]} / {VOTE_QUOTA[type]}
                    </span>
                  </div>
                  <div className="mt-[5px]">
                    <ProgressBar percent={(used[type] / VOTE_QUOTA[type]) * 100} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-[11px] font-mono text-[10.5px] leading-[1.7] text-[var(--color-text-muted)]">
              {isReadOnly ? (
                <>
                  {soiree.isCurrent
                    ? `Le vote a fermé à ${voteCloseLabel}, 30 minutes avant le départ. `
                    : "Les votes de cette soirée sont clos : elle ne se modifie plus. "}
                  Elle a gardé ses {RETAINED_COUNT.CAR} véhicules les plus votés et son
                  circuit.
                </>
              ) : (
                <>
                  {VOTE_QUOTA.CAR} votes pour les véhicules, {VOTE_QUOTA.TRACK} pour les
                  circuits : la soirée garde les {RETAINED_COUNT.CAR} véhicules et le
                  circuit les plus votés. Un vote se retire à tout moment pour le placer
                  ailleurs.
                </>
              )}
            </p>
          </div>

          {isReadOnly && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/historique"
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[14px] py-2 font-sans text-xs font-medium"
              >
                ← Historique
              </Link>
              <Link
                href="/soiree"
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[14px] py-2 font-sans text-xs font-medium"
              >
                Soirée en cours
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
