"use client";

import { useRef, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import {
  describeModFileProblem,
  formatFileSize,
  MOD_FILE_ACCEPT_ATTRIBUTE,
  MOD_FILE_TTL_HOURS,
} from "@/lib/mods/file";
import type { ModFileUpload } from "@/lib/mock-data";
import type { ApiMod } from "@/lib/mods/serialize";

interface ModFilePanelProps {
  modId: string;
  /** Le fichier actuellement rattaché à la fiche, `undefined` si elle n'en a pas. */
  file?: ModFileUpload;
  /** Le plafond administrable du moment (US-K3), en octets, lu côté serveur. */
  maxBytes: number;
  /** Vrai si la fiche existe en base : les fiches de démonstration ne reçoivent rien. */
  canUpload: boolean;
  /** La fiche telle que la confirmation l'a réécrite. */
  onUploaded: (mod: ApiMod) => void;
}

/** L'envoi en cours : rien, en route (avec sa progression), ou en échec. */
type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; percent: number }
  | { kind: "error"; message: string };

/** Erreur d'un envoi que le membre a lui-même interrompu — elle ne s'affiche pas. */
const ABORTED = "aborted";

/**
 * `PUT` du fichier vers l'URL signée, en XHR et non en `fetch` : c'est le seul moyen
 * d'avoir la progression de l'envoi, que `fetch` ne publie pas côté requête. Le fichier
 * part directement dans le bucket Cloudflare, sans passer par l'application.
 */
function putToBucket(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", url);
    // Exactement le type que la route a signé : R2 compare, et rejetterait autre chose.
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Le bucket a refusé l'envoi (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Connexion interrompue pendant l'envoi."));
    xhr.onabort = () => reject(new Error(ABORTED));
    xhr.send(file);
  });
}

/**
 * US-H1 — le panneau « fichier » de la fiche : ce qui y est déposé, et de quoi en
 * déposer un.
 *
 * L'envoi se fait en trois temps (voir app/api/mods/[id]/upload/route.ts) : la route
 * signe une URL, le navigateur écrit dans le bucket, la route confirme. La barre suit
 * le deuxième temps, le seul qui dure.
 *
 * Cahier §2.2 : n'importe quel membre peut déposer un fichier sur n'importe quelle
 * fiche, comme il peut en corriger la description — l'auteur n'a pas de privilège ici.
 */
export function ModFilePanel({ modId, file, maxBytes, canUpload, onUploaded }: ModFilePanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const isUploading = phase.kind === "uploading";
  const limitLabel = `Archive ${MOD_FILE_ACCEPT_ATTRIBUTE.replaceAll(".", "").replaceAll(",", ", ")} · ${formatFileSize(maxBytes)} max`;

  async function handleFile(candidate: File) {
    // Première barrière, purement locale : inutile de demander une URL signée pour un
    // fichier que la route refusera. C'est elle qui tranche pour de bon, sur le plafond
    // relu en base.
    const problem = describeModFileProblem(candidate, maxBytes);
    if (problem) {
      setPhase({ kind: "error", message: problem });
      return;
    }

    setPhase({ kind: "uploading", filename: candidate.name, percent: 0 });

    try {
      const prepared = await fetch(`/api/mods/${modId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: candidate.name, size: candidate.size }),
      });
      const preparation = await prepared.json().catch(() => null);
      if (!prepared.ok) {
        throw new Error(preparation?.error ?? "L'envoi n'a pas pu être préparé.");
      }

      await putToBucket(
        preparation.uploadUrl,
        candidate,
        preparation.contentType,
        (percent) =>
          setPhase((current) =>
            current.kind === "uploading" ? { ...current, percent } : current,
          ),
        (xhr) => {
          xhrRef.current = xhr;
        },
      );

      // Le fichier est dans le bucket ; il n'est rattaché à la fiche qu'ici, une fois
      // que le serveur est allé vérifier ce qui y a réellement atterri.
      const confirmed = await fetch(`/api/mods/${modId}/upload`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: preparation.key }),
      });
      const mod = await confirmed.json().catch(() => null);
      if (!confirmed.ok) {
        throw new Error(mod?.error ?? "Le fichier n'a pas pu être rattaché à la fiche.");
      }

      setPhase({ kind: "idle" });
      onUploaded(mod as ApiMod);
    } catch (error) {
      const message = error instanceof Error ? error.message : "L'envoi a échoué.";
      // Un envoi interrompu à la demande n'est pas une erreur : le panneau revient
      // simplement à son état d'avant.
      setPhase(message === ABORTED ? { kind: "idle" } : { kind: "error", message });
    } finally {
      xhrRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function pick() {
    if (!isUploading) inputRef.current?.click();
  }

  return (
    <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[15px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          FICHIER SUR PADDOCK
        </span>
        {file && !isUploading && (
          <span
            className="px-[6px] py-[2px] font-mono text-[10px]"
            style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
          >
            {file.expired ? "EXPIRÉ" : `EXPIRE DANS ${file.expiresInLabel.toUpperCase()}`}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={MOD_FILE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const [candidate] = Array.from(event.target.files ?? []);
          if (candidate) void handleFile(candidate);
        }}
      />

      {isUploading ? (
        <>
          <div className="mt-2 truncate font-sans text-[13px] font-semibold">{phase.filename}</div>
          <div className="mt-[2px] font-mono text-[10px] text-[var(--color-text-muted)]">
            envoi vers Cloudflare — {phase.percent} %
          </div>
          <div className="mt-[10px]">
            <ProgressBar percent={phase.percent} height={4} />
          </div>
          <button
            type="button"
            onClick={() => xhrRef.current?.abort()}
            className="btn-outline mt-3 w-full rounded-sm border border-[var(--color-border-strong)] py-[9px] font-sans text-xs font-medium"
          >
            Annuler l&apos;envoi
          </button>
        </>
      ) : file ? (
        <>
          <div className="mt-2 truncate font-sans text-[13px] font-semibold">{file.filename}</div>
          {(file.sizeLabel || file.uploadedByLabel) && (
            <div className="mt-[2px] font-mono text-[10px] text-[var(--color-text-muted)]">
              {[file.sizeLabel, file.uploadedByLabel].filter(Boolean).join(" · ")}
            </div>
          )}
          <div className="mt-[10px]">
            <ProgressBar percent={file.progressPercent} height={4} />
          </div>
          <div className="mt-3 flex gap-[7px]">
            {file.href ? (
              <a
                href={file.href}
                download={file.filename}
                className="flex-1 rounded-sm py-[9px] text-center font-sans text-xs font-semibold"
                style={{ background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }}
              >
                Télécharger
              </a>
            ) : (
              <span
                className="flex-1 rounded-sm py-[9px] text-center font-sans text-xs font-semibold"
                style={{ background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }}
              >
                Télécharger
              </span>
            )}
            {canUpload && (
              <button
                type="button"
                onClick={pick}
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[9px] font-sans text-xs font-medium"
              >
                Ré-uploader
              </button>
            )}
          </div>
        </>
      ) : (
        <div
          onClick={pick}
          onDrop={(event) => {
            event.preventDefault();
            const [candidate] = Array.from(event.dataTransfer.files);
            if (candidate) void handleFile(candidate);
          }}
          onDragOver={(event) => event.preventDefault()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              pick();
            }
          }}
          className="dropzone mt-[10px] flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--color-border-dashed)] px-2 text-center font-mono text-[10px] text-[var(--color-text-muted)]"
        >
          <span>glisse l&apos;archive du mod ici, ou clique pour choisir</span>
          <span className="text-[var(--color-text-faint)]">{limitLabel}</span>
        </div>
      )}

      {phase.kind === "error" && (
        <p
          role="alert"
          className="mt-[10px] font-mono text-[10px] leading-[1.5] text-[var(--color-danger-text)]"
        >
          {phase.message}
        </p>
      )}

      <div className="mt-[10px] border-t border-[var(--color-border-hairline)] pt-[10px] font-mono text-[10px] leading-[1.55] text-[var(--color-text-muted)]">
        Les fichiers déposés ici sautent {MOD_FILE_TTL_HOURS} h après l&apos;upload, quoi qu&apos;il
        arrive. La fiche, elle, reste. Pour une soirée lointaine, garde le lien externe.
      </div>
    </div>
  );
}
