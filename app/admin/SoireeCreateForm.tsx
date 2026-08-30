"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatSoireeCountdown, formatSoireeDate } from "@/lib/soirees/format";
import { SOIREE_NAME_MAX_LENGTH, type SoireeFieldErrors } from "@/lib/soirees/schema";
import type { ApiSoireeSummary } from "@/lib/soirees/serialize";

/**
 * US-G1 — « Créer une soirée », visible des seuls admins (cahier §2.6).
 *
 * Le panneau liste aussi les soirées existantes, et pas par décoration : la « soirée en
 * cours » est la prochaine à venir, donc en créer une plus proche déplace celle où tout
 * le monde vote. Sans cette liste, l'organisateur ne verrait pas ce qu'il déplace.
 */
export function SoireeCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SoireeFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [soirees, setSoirees] = useState<ApiSoireeSummary[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/soirees", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ApiSoireeSummary[] | null) => setSoirees(body ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [isSubmitting]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/soirees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `datetime-local` rend « 2026-09-04T21:00 », sans fuseau : le navigateur et le
        // serveur sont dans le même, `new Date(...)` côté serveur lirait donc l'heure
        // en UTC. On envoie une ISO complète, construite ici, où le fuseau est connu.
        body: JSON.stringify({ name, date: date ? new Date(date).toISOString() : "" }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(body?.fieldErrors ?? {});
        setError(body?.fieldErrors ? null : (body?.error ?? "La soirée n'a pas pu être créée."));
        return;
      }

      setName("");
      setDate("");
      // La soirée en cours vient peut-être de changer : le catalogue, les fiches et la
      // page soirée en dépendent tous, et sont rendus côté serveur.
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        CRÉER UNE SOIRÉE
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-[13px] flex flex-col gap-[11px]">
        <div>
          <label
            htmlFor="soiree-date"
            className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]"
          >
            DATE ET HEURE — OBLIGATOIRE
          </label>
          <input
            id="soiree-date"
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={Boolean(fieldErrors.date)}
            className="mt-[5px] w-full rounded-sm border bg-[var(--color-field)] px-[11px] py-[9px] font-mono text-xs text-[var(--color-foreground)] outline-none"
            style={{
              borderColor: fieldErrors.date ? "var(--color-danger)" : "var(--color-border-strong)",
            }}
          />
          {fieldErrors.date && (
            <p className="mt-[5px] font-mono text-[10.5px] text-[var(--color-danger-text)]">
              {fieldErrors.date}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="soiree-name"
            className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]"
          >
            THÈME — OPTIONNEL
          </label>
          <input
            id="soiree-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={SOIREE_NAME_MAX_LENGTH}
            placeholder="ex. touge only"
            aria-invalid={Boolean(fieldErrors.name)}
            className="mt-[5px] w-full rounded-sm border bg-[var(--color-field)] px-[11px] py-[9px] font-sans text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
            style={{
              borderColor: fieldErrors.name ? "var(--color-danger)" : "var(--color-border-strong)",
            }}
          />
          {fieldErrors.name && (
            <p className="mt-[5px] font-mono text-[10.5px] text-[var(--color-danger-text)]">
              {fieldErrors.name}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="font-mono text-[10.5px] text-[var(--color-danger-text)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-sm px-[14px] py-2 font-sans text-xs font-semibold disabled:opacity-60"
          style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
        >
          {isSubmitting ? "Création…" : "Créer la soirée"}
        </button>
      </form>

      <div className="mt-4 border-t border-[var(--color-border-hairline)] pt-3">
        <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          SOIRÉES · {soirees?.length ?? "…"}
        </div>
        <div className="mt-2 flex flex-col gap-[7px]">
          {soirees?.length === 0 && (
            <p className="font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
              Aucune soirée encore. Tant qu&apos;il n&apos;y en a pas, personne ne peut voter.
            </p>
          )}
          {soirees?.map((soiree) => (
            <div key={soiree.id} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-sans text-[12px] font-medium">
                  {formatSoireeDate(new Date(soiree.date))}
                </div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  {soiree.name ? `${soiree.name} · ` : ""}
                  {soiree.modCount} mod{soiree.modCount > 1 ? "s" : ""}
                </div>
              </div>
              <span
                className="flex-none font-mono text-[9.5px] tracking-[0.08em]"
                style={
                  soiree.isCurrent
                    ? { background: "var(--color-amber)", color: "var(--color-ink)", padding: "2px 6px" }
                    : { color: "var(--color-text-faint)" }
                }
              >
                {soiree.isCurrent
                  ? "EN COURS"
                  : formatSoireeCountdown(new Date(soiree.date)).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
