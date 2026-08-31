import {
  DELETION_TARGET_LABELS,
  formatDeletionDate,
  type ApiDeletionEntry,
} from "@/lib/admin/settings";
import type { DeletionLogPage } from "@/lib/admin/deletion-log";

/**
 * US-K2 — le journal des suppressions.
 *
 * Purement affichage, et volontairement sans « annuler » : rien de ce qui est listé ici
 * n'existe encore. Le journal répond à une question, une seule — « où est passée cette
 * fiche, et qui l'a retirée ? » — que la suppression rendait jusqu'ici sans réponse.
 *
 * Les suppressions faites par un auteur sur sa propre fiche (US-B4) y figurent aussi,
 * distinguées de la modération : sans elles, la moitié des disparitions du catalogue
 * resterait inexpliquée.
 */
export function DeletionJournal({ entries, olderCount }: DeletionLogPage) {
  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px] px-[18px]">
      <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        JOURNAL DES SUPPRESSIONS
      </div>
      <div className="mt-[11px] flex flex-col gap-[6px] font-mono text-[10.5px] text-[var(--color-text-secondary)]">
        {entries.length === 0 && (
          <div className="text-[var(--color-text-muted)]">
            Rien n&apos;a encore été supprimé.
          </div>
        )}
        {entries.map((entry) => (
          <DeletionLine key={entry.id} entry={entry} />
        ))}
        {olderCount > 0 && (
          <div className="text-[var(--color-text-muted)]">
            — {olderCount} entrée{olderCount > 1 ? "s" : ""} plus ancienne
            {olderCount > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function DeletionLine({ entry }: { entry: ApiDeletionEntry }) {
  return (
    <div>
      {formatDeletionDate(new Date(entry.createdAt))} · {entry.actor} ·{" "}
      {DELETION_TARGET_LABELS[entry.target]} « {entry.label} »
      {entry.detail ? ` · ${entry.detail}` : ""}{" "}
      <span className="text-[var(--color-text-faint)]">
        · {entry.asAdmin ? "admin" : "auteur"}
      </span>
    </div>
  );
}
