import { PurgeFilesButton } from "@/app/admin/PurgeFilesButton";
import { ProgressBar } from "@/components/ProgressBar";
import type { ApiModFileSweep, ApiStorageUsage } from "@/lib/admin/settings";
import { formatFileSize, MOD_FILE_TTL_HOURS } from "@/lib/mods/file";

interface StoragePanelProps {
  /** `null` quand Cloudflare n'a pas pu être interrogé (configuration absente, panne). */
  usage: ApiStorageUsage | null;
  /** `null` tant qu'aucun balayage n'a tourné. */
  lastSweep: ApiModFileSweep | null;
  /** Vrai si ce passage est trop ancien pour une tâche horaire — décidé à la lecture. */
  sweepStale: boolean;
}

const SWEEP_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * US-H1 / US-H3 — ce que le bucket Cloudflare porte, et quand le nettoyage y est passé.
 *
 * Les deux vont ensemble et pas par commodité de mise en page : la jauge ne veut dire
 * quelque chose que si le balayage tourne. Une occupation à 8 Go est une information
 * paisible quand le nettoyage est passé il y a une heure, et une alerte s'il n'est jamais
 * passé — c'est la même barre, elle ne se lit pas pareil. Les afficher côte à côte est le
 * seul moyen de ne pas laisser conclure de travers.
 *
 * Composant serveur : il n'a rien à écrire, tout lui est donné par la page.
 */
export function StoragePanel({ usage, lastSweep, sweepStale }: StoragePanelProps) {
  return (
    <div className="mt-4 border-t border-[var(--color-border-hairline)] pt-[14px]">
      <div className="font-sans text-xs font-medium">Stockage Cloudflare</div>

      {usage ? (
        <StorageGauge usage={usage} />
      ) : (
        <p className="mt-2 font-mono text-[10px] leading-[1.55] text-[var(--color-text-muted)]">
          Occupation indisponible — le bucket n&apos;a pas pu être interrogé. Vérifie les
          variables <span className="text-[var(--color-text-secondary)]">R2_*</span>.
        </p>
      )}

      <div className="mt-[14px] font-sans text-xs font-medium">Rétention des fichiers</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-[15px]">{MOD_FILE_TTL_HOURS} h</span>
        {/* Cahier §2.7 : « règle simple et fixe ». Le délai n'est pas un réglage,
            contrairement au plafond plus haut. */}
        <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
          après l&apos;upload · non modifiable
        </span>
      </div>

      <SweepLine sweep={lastSweep} stale={sweepStale} />

      {/* US-K1 — le levier manuel, sous la trace du nettoyage automatique : c'est là
          qu'on regarde quand on se demande pourquoi le bucket ne se vide pas. */}
      <PurgeFilesButton hasFiles={(usage?.stored ?? 0) > 0} />
    </div>
  );
}

function StorageGauge({ usage }: { usage: ApiStorageUsage }) {
  const percent = usage.limit > 0 ? (usage.used / usage.limit) * 100 : 0;

  // Trois paliers, parce qu'ils appellent trois gestes différents : rien à faire, penser
  // à ne pas lancer de gros envoi, et « le prochain dépôt sera refusé ».
  const fill =
    percent >= 90
      ? "var(--color-danger-text)"
      : percent >= 70
        ? "var(--color-amber)"
        : "var(--color-ink)";

  return (
    <>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="font-mono text-[15px]">{formatFileSize(usage.used)}</span>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
          sur {formatFileSize(usage.limit)}
        </span>
      </div>

      <div className="mt-2">
        <ProgressBar percent={percent} height={4} fillColor={fill} />
      </div>

      <div className="mt-[6px] font-mono text-[10px] leading-[1.55] text-[var(--color-text-muted)]">
        {/* Le détail n'apparaît que quand il apprend quelque chose : hors envoi en cours,
            « 2,4 Go de fichiers » répéterait le chiffre juste au-dessus. */}
        {usage.reserved > 0
          ? `${formatFileSize(usage.stored)} déposés · ${formatFileSize(usage.reserved)} en cours d'envoi`
          : `${formatFileSize(usage.free)} libres`}
      </div>
    </>
  );
}

/** Le dernier passage du nettoyage — ou son absence, qui est l'information importante. */
function SweepLine({ sweep, stale }: { sweep: ApiModFileSweep | null; stale: boolean }) {
  if (!sweep) {
    return (
      <div className="mt-[9px] rounded-sm bg-[var(--color-border-hairline)] px-[11px] py-[9px] font-mono text-[10px] leading-[1.55] text-[var(--color-text-secondary)]">
        Aucun nettoyage enregistré. Tant que la tâche planifiée ne tourne pas, les fichiers
        ne s&apos;effacent pas d&apos;eux-mêmes — voir prisma/cron/expired-mod-files.sql.
      </div>
    );
  }

  const at = new Date(sweep.at);
  const badge = sweep.failed > 0 ? `${sweep.failed} ÉCHEC${sweep.failed > 1 ? "S" : ""}` : stale ? "EN RETARD" : "OK";
  const alarming = sweep.failed > 0 || stale;

  return (
    <div className="mt-[9px] flex items-center justify-between gap-2 rounded-sm bg-[var(--color-border-hairline)] px-[11px] py-[9px]">
      <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
        dernier nettoyage : {SWEEP_DATE.format(at)} ·{" "}
        {sweep.deleted === 0 ? "rien à retirer" : `${sweep.deleted} fichier${sweep.deleted > 1 ? "s" : ""}`}
      </span>
      <span
        className="shrink-0 px-[6px] py-[2px] font-mono text-[10px]"
        style={{
          background: alarming ? "var(--color-danger-text)" : "var(--color-amber)",
          color: "var(--color-ink)",
        }}
      >
        {badge}
      </span>
    </div>
  );
}
