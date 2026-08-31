"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { InlineEditActions } from "@/components/InlineEditActions";
import { describeImageProblem, IMAGE_ACCEPT_ATTRIBUTE, MAX_IMAGE_LABEL } from "@/lib/mods/image";
import type { ApiMod } from "@/lib/mods/serialize";
import { usePatchMod } from "@/lib/mods/usePatchMod";

interface ModInlineImageEditProps {
  modId: string;
  /** L'image actuelle de la fiche, `null` si elle n'en a pas encore. */
  currentImageUrl: string | null;
  onSaved: (mod: ApiMod) => void;
  onCancel: () => void;
}

/**
 * US-B2 / US-B3 — remplacer l'image d'aperçu depuis la fiche.
 *
 * Deux temps, comme dans le formulaire complet : le fichier part d'abord vers
 * `/api/uploads/mod-image`, qui le ré-encode et renvoie une URL ; c'est cette URL que
 * l'enregistrement écrit dans la fiche. Tant qu'on n'a pas enregistré, l'image en ligne
 * reste la bonne — d'où le bouton d'enregistrement éteint tant qu'aucun fichier n'est
 * passé.
 *
 * Une image envoyée puis abandonnée (annulation, autre fichier choisi) est retirée du
 * bucket au mieux : en cas d'échec, le balayage périodique la ramassera.
 */
export function ModInlineImageEdit({
  modId,
  currentImageUrl,
  onSaved,
  onCancel,
}: ModInlineImageEditProps) {
  const { save, isPending, error } = usePatchMod(modId);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // L'aperçu local est un object URL : sans révocation, le blob reste en mémoire tant
  // que l'onglet est ouvert.
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  /** Retire du bucket une image envoyée d'ici et finalement non retenue. */
  function releaseUpload(candidate: string | null) {
    if (!candidate || candidate === currentImageUrl) return;
    void fetch("/api/uploads/mod-image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: candidate }),
    }).catch(() => {});
  }

  async function handleFile(file: File) {
    setImageError(null);

    const problem = describeImageProblem(file);
    if (problem) {
      setImageError(problem);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Le fichier précédemment envoyé ne sera jamais enregistré : il part.
    releaseUpload(uploadedUrl);
    setUploadedUrl(null);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setIsUploading(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/mod-image", { method: "POST", body });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setPreview(null);
        setFileName(null);
        setImageError(result?.error ?? "L'image n'a pas pu être envoyée.");
        return;
      }
      setUploadedUrl(result.url);
    } catch {
      setPreview(null);
      setFileName(null);
      setImageError("Impossible d'envoyer l'image. Réessaie dans un instant.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadedUrl) return;

    const mod = await save({ imageUrl: uploadedUrl });
    if (mod) onSaved(mod);
  }

  function handleCancel() {
    releaseUpload(uploadedUrl);
    onCancel();
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending && !isUploading) {
          event.preventDefault();
          handleCancel();
        }
      }}
      className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[15px]"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          {currentImageUrl ? "REMPLACER L'IMAGE" : "AJOUTER UNE IMAGE"}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
          JPG ou PNG, max {MAX_IMAGE_LABEL}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          if (file) void handleFile(file);
        }}
      />

      <div
        onDrop={(event) => {
          event.preventDefault();
          const [file] = Array.from(event.dataTransfer.files);
          if (file) void handleFile(file);
        }}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className="dropzone mt-[9px] flex h-24 cursor-pointer items-center justify-center rounded-sm border border-dashed border-[var(--color-border-dashed)] bg-cover bg-center font-mono text-[10px] text-[var(--color-text-muted)]"
        style={
          preview
            ? { backgroundImage: `url(${preview})` }
            : {
                backgroundImage:
                  "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 6px, var(--color-placeholder-b) 6px 12px)",
              }
        }
      >
        {!preview && <span>glisse une image ici, ou clique pour choisir</span>}
        {isUploading && <span className="rounded-sm bg-[var(--color-surface)] px-2 py-1">envoi…</span>}
      </div>

      {imageError && (
        <p role="alert" className="mt-[7px] font-mono text-[10px] leading-[1.5] text-[var(--color-danger-text)]">
          {imageError}
        </p>
      )}

      {fileName && !isUploading && (
        <p className="mt-[7px] truncate font-mono text-[10px] text-[var(--color-text-muted)]">
          {fileName}
        </p>
      )}

      <InlineEditActions
        isPending={isPending}
        error={error}
        onCancel={handleCancel}
        // Rien à enregistrer tant que l'image n'est pas arrivée dans le bucket : un
        // clic ici n'écrirait que l'ancienne URL.
        disabled={!uploadedUrl || isUploading}
      />
    </form>
  );
}
