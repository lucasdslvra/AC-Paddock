import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ModThumbnail } from "@/components/ModThumbnail";
import { StatBlock } from "@/components/StatBlock";
import { formatSoireeDay, formatSoireeMonth } from "@/lib/soirees/format";
import type { ApiPastSoiree } from "@/lib/soirees/serialize";

/** Combien de mods du podium une ligne détaille, nom et score compris. */
const PODIUM_SIZE = 3;

/** Combien de vignettes une ligne montre avant de résumer le reste en « +N ». */
const THUMBNAILS = 5;

/** Combien de soirées la frise du bandeau couvre — les plus récentes. */
const SPARKLINE_LENGTH = 14;

interface HistoriqueViewProps {
  /** Les soirées passées, de la plus récente à la plus ancienne (`listPastSoirees`). */
  soirees: ApiPastSoiree[];
  /** Le dénominateur de « 6 / 9 ont voté » : les membres connus de la base. */
  memberCount: number;
}

/**
 * US-I1 — l'historique des soirées passées.
 *
 * Rendu côté serveur, sans état : rien n'y est cliquable qui ne soit un lien. Les votes
 * sont clos une fois la soirée passée, il n'y a donc aucune écriture à faire d'ici — le
 * détail d'une soirée (US-I2) est une page à part, en lecture seule elle aussi.
 */
export function HistoriqueView({ soirees, memberCount }: HistoriqueViewProps) {
  const totalMods = soirees.reduce((sum, soiree) => sum + soiree.modCount, 0);
  const totalVoters = soirees.reduce((sum, soiree) => sum + soiree.voterCount, 0);
  // Sans soirée passée, la moyenne n'existe pas — et « 0.0 » se lirait comme « personne
  // ne vote jamais », ce qui n'est pas ce que dit une archive vide.
  const averageVoters = soirees.length === 0 ? "—" : (totalVoters / soirees.length).toFixed(1);

  // La liste arrive de la plus récente à la plus ancienne ; la frise se lit dans le sens
  // du temps, la dernière soirée à droite.
  const sparkline = soirees.slice(0, SPARKLINE_LENGTH).reverse();
  const peakVoters = Math.max(...sparkline.map((soiree) => soiree.voterCount), 1);

  // La plus ancienne ferme la liste, qui est triée par date décroissante.
  const since = soirees.at(-1);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader active="historique" />

      <div className="flex flex-wrap items-end gap-[30px] border-b border-[var(--color-border)] p-[22px] pb-[18px]">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            ARCHIVES
          </div>
          <h1 className="mt-2 font-sans text-[36px] font-bold leading-none tracking-[-0.035em]">
            {soirees.length === 0
              ? "Aucune soirée passée"
              : `${soirees.length} soirée${soirees.length > 1 ? "s" : ""} jouée${
                  soirees.length > 1 ? "s" : ""
                }`}
          </h1>
          {since && (
            <div className="mt-[7px] font-mono text-[11px] text-[var(--color-text-secondary)]">
              depuis {formatSoireeMonth(new Date(since.date))}
            </div>
          )}
        </div>

        {sparkline.length > 0 && (
          // Les votants soirée après soirée. Une barre par soirée, la plus récente en
          // ambre : c'est celle à laquelle les autres se comparent.
          <div className="ml-auto flex h-[52px] items-end gap-[3px]" aria-hidden>
            {sparkline.map((soiree, index) => (
              <div
                key={soiree.id}
                title={`${soiree.voterCount} votant${soiree.voterCount > 1 ? "s" : ""}`}
                style={{
                  width: 14,
                  // Une soirée sans un seul votant garde un trait : une barre nulle se
                  // confondrait avec une soirée absente de la frise.
                  height: `${Math.max(4, (soiree.voterCount / peakVoters) * 100)}%`,
                  background:
                    index === sparkline.length - 1
                      ? "var(--color-amber)"
                      : "var(--color-bar-dimmed)",
                }}
              />
            ))}
          </div>
        )}

        <div className={`flex gap-[22px] ${sparkline.length > 0 ? "" : "ml-auto"}`}>
          <StatBlock label="MODS ENGAGÉS" value={totalMods} order="value-first" />
          <StatBlock label="VOTANTS / SOIRÉE" value={averageVoters} order="value-first" />
        </div>
      </div>

      {soirees.length === 0 ? (
        <div className="m-[22px] rounded-sm border border-dashed border-[var(--color-border-dashed)] p-8 text-center">
          <p className="font-sans text-sm font-semibold">
            Aucune soirée n&apos;a encore eu lieu.
          </p>
          <p className="mx-auto mt-[6px] max-w-[460px] font-mono text-[10.5px] leading-[1.7] text-[var(--color-text-muted)]">
            Une soirée rejoint l&apos;historique le lendemain de sa date, avec le
            classement final des mods qui y étaient engagés.
          </p>
          <Link
            href="/soiree"
            className="btn-outline mt-4 inline-block rounded-sm border border-[var(--color-border-strong)] px-[14px] py-2 font-sans text-xs font-medium"
          >
            Voir la soirée en cours
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-[9px] p-[18px_22px_22px]">
          <div className="hidden grid-cols-[150px_1fr_260px_92px] gap-4 px-[15px] pb-[7px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)] md:grid">
            <span>DATE / THÈME</span>
            <span>PODIUM</span>
            <span>MODS ENGAGÉS</span>
            <span className="text-right">VOTANTS</span>
          </div>

          {soirees.map((soiree) => (
            <PastSoireeRow key={soiree.id} soiree={soiree} memberCount={memberCount} />
          ))}
        </div>
      )}
    </div>
  );
}

function PastSoireeRow({
  soiree,
  memberCount,
}: {
  soiree: ApiPastSoiree;
  memberCount: number;
}) {
  const podium = soiree.mods.slice(0, PODIUM_SIZE);
  const thumbnails = soiree.mods.slice(0, THUMBNAILS);
  // Comptés sur le total de la soirée, pas sur les mods chargés : la liste est bornée
  // (`PAST_SOIREE_PREVIEW_MODS`), le compteur ne l'est pas.
  const extra = soiree.modCount - thumbnails.length;

  return (
    <article className="grid grid-cols-1 items-center gap-4 rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[14px_15px] md:grid-cols-[150px_1fr_260px_92px]">
      <div>
        <Link
          href={`/soiree/${soiree.id}`}
          className="link-title font-sans text-sm font-semibold"
        >
          {formatSoireeDay(new Date(soiree.date))}
        </Link>
        <div className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
          {soiree.name ?? "sans thème"}
        </div>
      </div>

      <div className="flex flex-col gap-[5px]">
        {podium.length === 0 ? (
          <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">
            aucun mod engagé
          </span>
        ) : (
          podium.map((entry, index) => (
            <div key={entry.modId} className="flex items-center gap-[9px]">
              <span
                className="font-mono text-[10px]"
                style={{ color: index === 0 ? "var(--color-link)" : "var(--color-text-faint)" }}
              >
                {index + 1}
              </span>
              <Link
                href={`/mods/${entry.modId}`}
                className="link-title font-sans text-[13px]"
                style={{
                  fontWeight: index === 0 ? 500 : 400,
                  color: index === 0 ? undefined : "var(--color-text-secondary)",
                }}
              >
                {entry.name}
              </Link>
              <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
                {entry.votes} vote{entry.votes > 1 ? "s" : ""}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-[5px]">
        {thumbnails.map((entry) => (
          <ModThumbnail
            key={entry.modId}
            src={entry.imageUrl ?? undefined}
            name={entry.name}
            size={40}
          />
        ))}
        {extra > 0 && (
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-sm border border-[var(--color-border)] font-mono text-[10px] text-[var(--color-text-muted)]">
            +{extra}
          </div>
        )}
      </div>

      <div className="md:text-right">
        <div className="font-mono text-[17px]">
          {soiree.voterCount}/{memberCount}
        </div>
        <Link
          href={`/soiree/${soiree.id}`}
          className="link-underline font-mono text-[10px] text-[var(--color-text-faint)]"
        >
          détail ↗
        </Link>
      </div>
    </article>
  );
}
