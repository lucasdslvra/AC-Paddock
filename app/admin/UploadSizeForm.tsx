"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  DEFAULT_MOD_FILE_MO,
  MAX_MOD_FILE_MO,
  MIN_MOD_FILE_MO,
  type ApiAdminConfig,
} from "@/lib/admin/settings";
import { formatCreatedAt } from "@/lib/mods/format";

/**
 * US-K3 — « configurer la taille maximale des uploads ».
 *
 * Le réglage porte sur le **fichier du mod** (le .zip du cahier §2.2), pas sur l'image
 * d'aperçu : c'est lui qui pèse, lui que le lien externe permet d'éviter, et lui dont
 * le cahier §2.6 confie le plafond à l'admin.
 *
 * La valeur s'applique aux prochains envois sans redéploiement — c'est toute la raison
 * d'être de la table `AppConfig` : le plafond était jusqu'ici une constante du code, et
 * le changer voulait dire livrer une nouvelle version.
 */
export function UploadSizeForm({ config }: { config: ApiAdminConfig }) {
  const router = useRouter();
  const [value, setValue] = useState(config.maxModFileMo);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = value !== config.maxModFileMo;
  const sliderPercent =
    ((value - MIN_MOD_FILE_MO) / (MAX_MOD_FILE_MO - MIN_MOD_FILE_MO)) * 100;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSaving || !isDirty) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxModFileMo: value }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          body?.fieldErrors?.maxModFileMo ?? body?.error ?? "Le réglage n'a pas pu être enregistré.",
        );
        return;
      }

      // La date et l'auteur affichés sous le curseur viennent de la page serveur.
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-[13px]">
      <div className="flex items-baseline justify-between">
        <label htmlFor="max-upload" className="font-sans text-xs font-medium">
          Taille max d&apos;un fichier de mod
        </label>
        <span className="font-mono text-[13px] font-medium">{value} Mo</span>
      </div>

      {/* Le curseur natif est transparent et posé par-dessus le tracé dessiné : il
          reste le champ réel — souris, clavier et lecteurs d'écran passent par lui —
          mais l'apparence est celle du reste de l'interface, que les navigateurs ne
          savent pas donner à un `input[type=range]`. */}
      <div className="relative mt-2 rounded-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-[var(--color-amber)]">
        <div aria-hidden className="relative h-1" style={{ background: "var(--color-border-strong)" }}>
          <div className="h-1" style={{ width: `${sliderPercent}%`, background: "var(--color-ink)" }} />
          <div
            className="absolute -top-1 h-3 w-3 rounded-full"
            style={{
              left: `calc(${sliderPercent}% - 6px)`,
              background: "var(--color-amber)",
              border: "1px solid var(--color-ink)",
            }}
          />
        </div>
        <input
          id="max-upload"
          type="range"
          min={MIN_MOD_FILE_MO}
          max={MAX_MOD_FILE_MO}
          step={10}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          className="absolute inset-x-0 -top-2 h-5 w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="mt-[5px] flex justify-between font-mono text-[10px] text-[var(--color-text-faint)]">
        <span>{MIN_MOD_FILE_MO} Mo</span>
        <span>{MAX_MOD_FILE_MO} Mo</span>
      </div>

      <div className="mt-[7px] font-mono text-[10px] leading-[1.6] text-[var(--color-text-secondary)]">
        S&apos;applique aux prochains uploads, sans redéploiement.
        {config.maxModFileUpdatedAt ? (
          <>
            {" "}
            Posée le {formatCreatedAt(new Date(config.maxModFileUpdatedAt))}
            {config.maxModFileUpdatedBy ? ` par ${config.maxModFileUpdatedBy}` : ""}.
          </>
        ) : (
          <> Valeur par défaut ({DEFAULT_MOD_FILE_MO} Mo), jamais modifiée.</>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 font-mono text-[10.5px] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}

      {isDirty && (
        <div className="mt-[9px] flex gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="btn-solid rounded-sm px-[12px] py-[7px] font-sans text-[11px] font-semibold disabled:opacity-60"
            style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(config.maxModFileMo);
              setError(null);
            }}
            disabled={isSaving}
            className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[12px] py-[7px] font-sans text-[11px] font-medium disabled:opacity-60"
          >
            Annuler
          </button>
        </div>
      )}
    </form>
  );
}
