"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { BreadcrumbHeader } from "@/components/BreadcrumbHeader";
import { TagInput } from "@/components/TagInput";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { describeImageProblem, IMAGE_ACCEPT_ATTRIBUTE, MAX_IMAGE_LABEL } from "@/lib/mods/image";
import { modInputSchema, toFieldErrors, type ModFieldErrors } from "@/lib/mods/schema";
import { toDbModType } from "@/lib/mods/type";
import { currentSession, mods, type ModType } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

const FORM_ID = "fiche-mod";

export interface ModFormValues {
  id: string;
  type: ModType;
  name: string;
  url: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  author: string;
}

interface ModFormProps {
  /** Fiche à modifier (US-B3). Absente, le formulaire crée une nouvelle fiche (US-B1). */
  mod?: ModFormValues;
}

export function ModForm({ mod }: ModFormProps) {
  const isEditing = mod !== undefined;
  const { session, isLoading } = useRequireAuth();
  const router = useRouter();

  const [type, setType] = useState<ModType>(mod?.type ?? "vehicule");
  const [name, setName] = useState(mod?.name ?? "");
  const [url, setUrl] = useState(mod?.url ?? "");
  const [description, setDescription] = useState(mod?.description ?? "");
  const [tags, setTags] = useState<string[]>(mod?.tags ?? []);
  const [imageUrl, setImageUrl] = useState<string | null>(mod?.imageUrl ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(mod?.imageUrl ?? null);
  const [imageName, setImageName] = useState<string | null>(mod?.imageUrl ? "image actuelle" : null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [fieldErrors, setFieldErrors] = useState<ModFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Détection de doublons : sans objet à l'édition, où la fiche se trouverait elle-même.
  const similarMods = useMemo(() => {
    if (isEditing) return [];
    const query = name.trim().toLowerCase();
    if (query.length < 3) return [];
    return mods.filter((entry) => entry.name.toLowerCase().includes(query)).slice(0, 3);
  }, [isEditing, name]);

  const matchingUrlMod = useMemo(() => {
    if (isEditing) return undefined;
    const query = url.trim().toLowerCase();
    if (query.length < 6) return undefined;
    return mods.find((entry) => entry.primaryLink && query.includes(entry.primaryLink.url.toLowerCase()));
  }, [isEditing, url]);

  // L'aperçu local est un object URL : il faut le libérer, sinon le blob reste en
  // mémoire tant que l'onglet est ouvert. L'image déjà en ligne (édition) est une URL
  // http ordinaire, `revokeObjectURL` ne lui fait rien.
  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function resetFileInput() {
    // Sans ça, re-sélectionner le même fichier ne déclenche pas de nouvel événement.
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  /**
   * Retire du bucket une image envoyée depuis ce formulaire et finalement non retenue.
   * L'image déjà rattachée à la fiche est épargnée : elle est encore la bonne tant que
   * l'édition n'est pas enregistrée, et c'est la route PATCH qui la supprimera. Appel
   * au mieux : en cas d'échec, le balayage périodique ramassera l'orpheline.
   */
  function releaseUploadedImage(candidate: string | null) {
    if (!candidate || candidate === mod?.imageUrl) return;
    void fetch("/api/uploads/mod-image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: candidate }),
    }).catch(() => {});
  }

  function clearImage() {
    releaseUploadedImage(imageUrl);
    // L'object URL de l'aperçu est libéré par l'effet ci-dessus, au changement d'état.
    setImagePreview(null);
    setImageUrl(null);
    setImageName(null);
    resetFileInput();
  }

  async function handleImageFile(file: File) {
    setImageError(null);

    const problem = describeImageProblem(file);
    if (problem) {
      // On garde l'image déjà attachée : un mauvais choix de fichier ne doit pas la perdre.
      setImageError(problem);
      resetFileInput();
      return;
    }

    // Aperçu immédiat, sans attendre l'aller-retour serveur.
    clearImage();
    setImagePreview(URL.createObjectURL(file));
    setImageName(file.name);
    setIsUploadingImage(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/mod-image", { method: "POST", body });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        clearImage();
        setImageError(result?.error ?? "L'image n'a pas pu être envoyée.");
        return;
      }
      setImageUrl(result.url);
    } catch {
      clearImage();
      setImageError("Impossible d'envoyer l'image. Réessaie dans un instant.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  function handleImageDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const [file] = Array.from(event.dataTransfer.files);
    if (file) void handleImageFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    // Même schéma qu'en base : la validation client évite un aller-retour inutile,
    // celle de la route reste la seule qui fasse autorité. On envoie toujours tous les
    // champs, y compris vides — c'est ce qui permet d'effacer une description.
    const parsed = modInputSchema.safeParse({
      type: toDbModType(type),
      name,
      url,
      description,
      imageUrl: imageUrl ?? undefined,
      tags,
    });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch(isEditing ? `/api/mods/${mod.id}` : "/api/mods", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          description: parsed.data.description ?? null,
          imageUrl: parsed.data.imageUrl ?? null,
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors);
        setSubmitError(body?.error ?? "La fiche n'a pas pu être enregistrée.");
        setIsSubmitting(false);
        return;
      }

      // On garde le bouton désactivé pendant la navigation vers la fiche.
      router.push(`/mods/${body.id}`);
      router.refresh();
    } catch {
      setSubmitError("Impossible de joindre le serveur. Réessaie dans un instant.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  const submitLabel = isEditing ? "Enregistrer" : "Publier la fiche";
  const pendingLabel = isEditing ? "Enregistrement…" : "Publication…";

  return (
    <div className="flex min-h-screen flex-col">
      <BreadcrumbHeader
        crumbs={
          isEditing
            ? [
                { label: "Catalogue", href: "/catalogue" },
                { label: mod.name, href: `/mods/${mod.id}` },
                { label: "Modifier" },
              ]
            : [{ label: "Catalogue", href: "/catalogue" }, { label: "Nouvelle fiche" }]
        }
        actions={
          <>
            <Link
              href={isEditing ? `/mods/${mod.id}` : "/catalogue"}
              className="rounded-sm border border-[var(--color-border-strong)] px-[13px] py-2 font-sans text-xs font-medium"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form={FORM_ID}
              disabled={isSubmitting || isUploadingImage}
              className="rounded-sm px-[14px] py-2 font-sans text-xs font-semibold disabled:opacity-60"
              style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
            >
              {isSubmitting ? pendingLabel : submitLabel}
            </button>
          </>
        }
      />

      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-[18px] p-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-[18px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          {submitError && (
            <div
              className="rounded-sm border px-3 py-[10px] font-sans text-xs"
              style={{ borderColor: "var(--color-danger)", color: "var(--color-danger-text)" }}
              role="alert"
            >
              {submitError}
            </div>
          )}

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              TYPE — OBLIGATOIRE
            </div>
            <div className="mt-2 flex gap-[7px]">
              {(["vehicule", "circuit"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  aria-pressed={type === option}
                  className="rounded-sm px-[18px] py-[10px] font-sans text-[13px] font-semibold"
                  style={
                    type === option
                      ? { background: "var(--color-ink)", color: "var(--color-surface)" }
                      : { border: "1px solid var(--color-border-strong)", color: "var(--color-text-secondary)" }
                  }
                >
                  {option === "vehicule" ? "Véhicule" : "Circuit"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                NOM DU MOD — OBLIGATOIRE
              </div>
              {similarMods.length > 0 && (
                <div className="font-mono text-[10px] text-[var(--color-link)]">
                  {similarMods.length} fiche{similarMods.length > 1 ? "s" : ""} proche{similarMods.length > 1 ? "s" : ""} trouvée{similarMods.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              placeholder="ex. Silvia S15 Rocket Bunny"
              className="mt-2 w-full rounded-sm border bg-white px-[13px] py-[11px] font-sans text-sm text-[#17181c] outline-none"
              style={{
                borderColor: fieldErrors.name
                  ? "var(--color-danger)"
                  : similarMods.length > 0
                    ? "var(--color-ink)"
                    : "var(--color-border-strong)",
              }}
            />
            {fieldErrors.name && (
              <p className="mt-[6px] font-mono text-[10.5px]" style={{ color: "var(--color-danger-text)" }}>
                {fieldErrors.name}
              </p>
            )}
            {similarMods.length > 0 && (
              <div className="rounded-b-sm border border-t-0 border-[var(--color-border-strong)] bg-white">
                <div className="border-b border-[var(--color-border-hairline)] px-[13px] py-[7px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  DÉJÀ DANS LE CATALOGUE ?
                </div>
                {similarMods.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-[11px] border-b border-[var(--color-border-hairline)] px-[13px] py-[9px] last:border-b-0">
                    <div
                      className="h-[34px] w-[34px] flex-none rounded-sm"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 4px, var(--color-placeholder-b) 4px 8px)",
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-sans text-[13px] font-semibold text-[#17181c]">{entry.name}</div>
                      <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {entry.type === "vehicule" ? "véhicule" : "circuit"} · {entry.tags.join(", ")} · {entry.totalVotes} votes
                      </div>
                    </div>
                    <Link href={`/mods/${entry.id}`} className="rounded-sm bg-[var(--color-ink)] px-[10px] py-[6px] font-sans text-[11px] font-medium text-[var(--color-surface)]">
                      Voir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              LIEN EXTERNE — CHAMP PRINCIPAL
            </div>
            <input
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-invalid={Boolean(fieldErrors.url)}
              placeholder="https://www.racedepartment.com/downloads/…"
              className="mt-2 w-full rounded-sm border bg-white px-[13px] py-[11px] font-mono text-xs text-[#17181c] outline-none"
              style={{
                borderColor:
                  fieldErrors.url || matchingUrlMod ? "var(--color-danger)" : "var(--color-border-strong)",
              }}
            />
            {fieldErrors.url && (
              <p className="mt-[6px] font-mono text-[10.5px]" style={{ color: "var(--color-danger-text)" }}>
                {fieldErrors.url}
              </p>
            )}
            {matchingUrlMod && (
              <div
                className="mt-2 flex gap-[11px] rounded-sm border p-3"
                style={{ borderColor: "var(--color-border-strong)", borderLeft: "3px solid var(--color-danger)", background: "rgba(255,255,255,.6)" }}
              >
                <div className="flex-1">
                  <div className="font-sans text-[13px] font-semibold text-[#17181c]">
                    Ce lien est déjà sur une fiche
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-secondary)]">
                    Après nettoyage des paramètres de suivi, l&apos;URL correspond à{" "}
                    <span className="text-[#17181c]">{matchingUrlMod.name}</span>. Si c&apos;est bien le
                    même mod, complète la fiche existante plutôt que d&apos;en créer une seconde : les
                    votes et les tags resteront regroupés.
                  </div>
                </div>
                <div className="flex flex-none flex-col justify-center gap-[6px]">
                  <Link
                    href={`/mods/${matchingUrlMod.id}`}
                    className="whitespace-nowrap rounded-sm bg-[var(--color-ink)] px-[11px] py-[7px] text-center font-sans text-[11px] font-semibold text-[var(--color-surface)]"
                  >
                    Voir la fiche existante
                  </Link>
                  <button
                    type="button"
                    onClick={() => setUrl("")}
                    className="whitespace-nowrap rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[7px] font-sans text-[11px] font-medium"
                  >
                    Créer quand même
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              DESCRIPTION — OPTIONNELLE
            </div>
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
              placeholder="Ce qu'il faut savoir avant de l'installer : version, pack de textures requis, physique…"
              className="mt-2 h-[62px] w-full rounded-sm border bg-white px-[13px] py-[11px] font-sans text-xs text-[#17181c] outline-none placeholder:text-[var(--color-text-faint)]"
              style={{
                borderColor: fieldErrors.description ? "var(--color-danger)" : "var(--color-border-strong)",
              }}
            />
            {fieldErrors.description && (
              <p className="mt-[6px] font-mono text-[10.5px]" style={{ color: "var(--color-danger-text)" }}>
                {fieldErrors.description}
              </p>
            )}
          </div>

          <TagInput value={tags} onChange={setTags} error={fieldErrors.tags} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                IMAGE D&apos;APERÇU — OPTIONNELLE
              </span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                max {MAX_IMAGE_LABEL}
              </span>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTRIBUTE}
              className="hidden"
              onChange={(event) => {
                const [file] = Array.from(event.target.files ?? []);
                if (file) void handleImageFile(file);
              }}
            />

            <div
              onDrop={handleImageDrop}
              onDragOver={(event) => event.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  imageInputRef.current?.click();
                }
              }}
              className="mt-[9px] flex h-24 cursor-pointer items-center justify-center rounded-sm border border-dashed border-[var(--color-border-dashed)] bg-cover bg-center font-mono text-[10px] text-[var(--color-text-muted)]"
              style={
                imagePreview
                  ? { backgroundImage: `url(${imagePreview})` }
                  : {
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 6px, var(--color-placeholder-b) 6px 12px)",
                    }
              }
            >
              {!imagePreview && <span>glisse une image ici</span>}
              {isUploadingImage && (
                <span className="rounded-sm bg-[var(--color-surface)] px-2 py-1">envoi…</span>
              )}
            </div>

            {imageError && (
              <p className="mt-[7px] font-mono text-[10px] leading-[1.5]" style={{ color: "var(--color-danger-text)" }}>
                {imageError}
              </p>
            )}

            {imagePreview && !isUploadingImage && (
              <div className="mt-[7px] flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                  {imageUrl ? imageName : "envoi interrompu"}
                </span>
                <button
                  type="button"
                  onClick={clearImage}
                  className="flex-none border-b font-sans text-[11px] font-medium text-[var(--color-link)]"
                  style={{ borderColor: "var(--color-amber)" }}
                >
                  retirer
                </button>
              </div>
            )}
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                FICHIER DU MOD — OPTIONNEL
              </span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">max 100 Mo</span>
            </div>
            <div className="mt-[9px] rounded-sm border border-dashed border-[var(--color-border-dashed)] p-3.5 text-center">
              <div className="font-sans text-xs font-semibold">Déposer le .zip</div>
              <div className="mt-[5px] font-mono text-[9.5px] leading-[1.6] text-[var(--color-text-muted)]">
                .zip, .rar, .7z
              </div>
            </div>
            <div className="mt-[11px] flex gap-2 rounded-sm bg-[var(--color-border-hairline)] p-[10px]">
              <span className="font-mono text-[10px] text-[var(--color-link)]">⚠</span>
              <span className="font-mono text-[10px] leading-[1.6] text-[var(--color-text-secondary)]">
                Supprimé automatiquement 24 h après l&apos;upload. Pour une soirée dans une semaine,
                mets juste le lien et tu ré-uploaderas le jour J.
              </span>
            </div>
          </div>

          {!isEditing && (
            <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px]">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                ENGAGER DIRECTEMENT
              </div>
              <div className="mt-[10px] flex items-center justify-between">
                <div>
                  <div className="font-sans text-xs font-semibold">Soirée du 4 sept</div>
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    thème : {currentSession.theme}
                  </div>
                </div>
                <ToggleSwitch on />
              </div>
            </div>
          )}

          <div className="px-1 font-mono text-[10px] leading-[1.6] text-[var(--color-text-muted)]">
            {isEditing ? (
              <>
                Tout le monde peut compléter cette fiche : tes modifications n&apos;en changent
                pas l&apos;auteur, qui reste {mod.author}.
              </>
            ) : (
              <>
                Tu publies sous ton pseudo Discord ({session?.user?.name ?? "…"}). N&apos;importe
                qui pourra ensuite compléter la fiche ; seuls toi et les admins pourrez la
                supprimer.
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
