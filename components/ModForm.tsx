"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { BreadcrumbHeader } from "@/components/BreadcrumbHeader";
import { ModThumbnail } from "@/components/ModThumbnail";
import { PageLoader } from "@/components/PageLoader";
import { TagInput } from "@/components/TagInput";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { TypeBadge } from "@/components/TypeBadge";
import { clearModDraft, readModDraft, saveModDraft } from "@/lib/mods/draft";
import { describeImageProblem, IMAGE_ACCEPT_ATTRIBUTE, MAX_IMAGE_LABEL } from "@/lib/mods/image";
import { modInputSchema, toFieldErrors, type ModFieldErrors } from "@/lib/mods/schema";
import { MOD_TYPES_UI, toDbModType, toUiModType } from "@/lib/mods/type";
import { useSimilarMods, useUrlDuplicate } from "@/lib/mods/useDuplicates";
import type { ModType } from "@/lib/mock-data";
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
  /**
   * US-G2 — la soirée en cours, où la fiche peut être engagée dès sa publication.
   * `null` s'il n'y en a aucune de programmée. Sans objet à l'édition : une fiche déjà
   * publiée s'engage depuis la fiche elle-même (`EngageModButton`).
   *
   * `voteClosedReason` porte la phrase de `voteClosedMessage` quand le classement du
   * soir est figé, `null` tant qu'il accepte des engagements — comme le `closedReason`
   * d'`EngageModButton`, à qui la fiche publiée pose la même question.
   */
  currentSoiree?: { dateLabel: string; theme: string | null; voteClosedReason: string | null } | null;
}

export function ModForm({ mod, currentSoiree = null }: ModFormProps) {
  const isEditing = mod !== undefined;
  const { session, isLoading } = useRequireAuth();
  const router = useRouter();

  // Saisie mise de côté avant d'aller voir une fiche suspectée d'être la même (US-D3).
  // Lue à l'initialisation, pas dans un effet : les champs sont peuplés dès le premier
  // rendu, sans passer par un formulaire vide qui se remplirait sous les yeux. Rien
  // n'est lu pendant le rendu serveur (`readModDraft` s'en garde), et le formulaire
  // n'est de toute façon affiché qu'une fois la session connue.
  const [draft] = useState(() => (mod ? null : readModDraft()));
  const [isDraftRestored, setIsDraftRestored] = useState(draft !== null);

  const [type, setType] = useState<ModType>(mod?.type ?? draft?.type ?? "vehicule");
  const [name, setName] = useState(mod?.name ?? draft?.name ?? "");
  const [url, setUrl] = useState(mod?.url ?? draft?.url ?? "");
  const [description, setDescription] = useState(mod?.description ?? draft?.description ?? "");
  const [tags, setTags] = useState<string[]>(mod?.tags ?? draft?.tags ?? []);
  const initialImageUrl = mod?.imageUrl ?? draft?.imageUrl ?? null;
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl);
  const [imageName, setImageName] = useState<string | null>(
    mod?.imageUrl ? "image actuelle" : (draft?.imageName ?? null),
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  // US-G2 — engager la fiche dans la soirée en cours au moment de la publier. **Décoché
  // par défaut** : proposer un mod au catalogue et l'inscrire au classement du soir sont
  // deux gestes différents, et une soirée programmée ne doit pas transformer le second
  // en effet de bord du premier. Le membre qui veut les deux a l'interrupteur sous les
  // yeux ; celui qui alimente le catalogue n'a rien à défaire.
  const [engage, setEngage] = useState(draft?.engage ?? false);
  // Une soirée dont le vote a fermé n'accepte plus d'engagement : l'interrupteur n'est
  // pas seulement caché, il cesse d'être envoyé — un brouillon repris pourrait le
  // rapporter allumé d'avant la fermeture.
  const canEngage = currentSoiree !== null && currentSoiree.voteClosedReason === null;
  const [fieldErrors, setFieldErrors] = useState<ModFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Détection de doublons (US-D1/D2) : sans objet à l'édition, où la fiche se
  // trouverait elle-même. Les deux vérifications interrogent l'API — le catalogue vit
  // en base, le formulaire n'en a aucune copie.
  const similarMods = useSimilarMods(name, !isEditing);
  const urlDuplicate = useUrlDuplicate(!isEditing);

  // Un brouillon repris porte peut-être le lien qui avait justement déclenché
  // l'aller-retour : on relance la vérification pour que l'avertissement soit exact
  // dès l'affichage, sans attendre que le champ reprenne le focus.
  const { check: checkUrlDuplicate } = urlDuplicate;
  useEffect(() => {
    if (draft?.url) checkUrlDuplicate(draft.url);
  }, [draft, checkUrlDuplicate]);

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

  /**
   * Met la saisie de côté avant d'ouvrir une fiche existante (US-D3) : au retour, le
   * formulaire la retrouve telle quelle, et « Voir la fiche » cesse d'être un choix
   * qui coûte la saisie. L'image déjà envoyée est référencée par son URL — elle reste
   * dans le bucket, il n'y a rien à renvoyer.
   */
  function keepDraft() {
    saveModDraft({ type, name, url, description, tags, imageUrl, imageName, engage });
  }

  /** « Repartir de zéro » : la saisie retrouvée n'a plus lieu d'être, on vide tout. */
  function discardDraft() {
    clearModDraft();
    // Libère aussi l'image envoyée avec cette saisie : plus rien ne la référencera.
    clearImage();
    setType("vehicule");
    setName("");
    setUrl("");
    setDescription("");
    setTags([]);
    setEngage(true);
    setFieldErrors({});
    urlDuplicate.reset();
    setIsDraftRestored(false);
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
          // Explicitement `null` plutôt qu'absent : `JSON.stringify` efface les clés
          // `undefined`, et une clé absente veut dire « ne touche pas » côté PATCH —
          // le lien vidé ne serait alors jamais effacé.
          url: parsed.data.url ?? null,
          description: parsed.data.description ?? null,
          imageUrl: parsed.data.imageUrl ?? null,
          // La route ne le lit qu'à la création, et c'est elle qui résout la soirée
          // visée : le formulaire dit s'il faut engager, pas où.
          ...(!isEditing && canEngage && { engage }),
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors);
        setSubmitError(body?.error ?? "La fiche n'a pas pu être enregistrée.");
        setIsSubmitting(false);
        return;
      }

      // La fiche est publiée : le brouillon n'a plus rien à retenir.
      if (!isEditing) clearModDraft();

      // On garde le bouton désactivé pendant la navigation vers la fiche.
      router.push(`/mods/${body.id}`);
      router.refresh();
    } catch {
      setSubmitError("Impossible de joindre le serveur. Réessaie dans un instant.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <PageLoader />;
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
              // Renoncer, c'est renoncer aussi à la saisie mise de côté : sans ça, elle
              // réapparaîtrait à la prochaine ouverture du formulaire.
              onClick={() => {
                if (!isEditing) clearModDraft();
              }}
              className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[13px] py-2 font-sans text-xs font-medium"
            >
              Annuler
            </Link>
            <button
              type="submit"
              form={FORM_ID}
              disabled={isSubmitting || isUploadingImage}
              className="btn-solid rounded-sm px-[14px] py-2 font-sans text-xs font-semibold disabled:opacity-60"
              style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
            >
              {isSubmitting ? pendingLabel : submitLabel}
            </button>
          </>
        }
      />

      <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="page-shell grid grid-cols-1 gap-[18px] p-4 sm:p-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-[18px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          {/* US-D3 — retour depuis une fiche existante : la saisie est là, intacte. */}
          {isDraftRestored && (
            <div
              className="flex items-center justify-between gap-3 rounded-sm border px-3 py-[10px]"
              style={{
                borderColor: "var(--color-border-strong)",
                borderLeft: "3px solid var(--color-amber)",
              }}
              role="status"
            >
              <span className="font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-secondary)]">
                Ta saisie a été retrouvée telle que tu l&apos;avais laissée.
              </span>
              <button
                type="button"
                onClick={discardDraft}
                className="link-underline flex-none border-b font-sans text-[11px] font-medium text-[var(--color-link)]"
                style={{ borderColor: "var(--color-amber)" }}
              >
                repartir de zéro
              </button>
            </div>
          )}

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
            <div className="mt-2 flex flex-wrap gap-[7px]">
              {MOD_TYPES_UI.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  aria-pressed={type === option}
                  className={`rounded-sm px-[18px] py-[10px] font-sans text-[13px] font-semibold ${
                    type === option
                      ? "btn-solid"
                      : "btn-outline border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:text-[var(--color-foreground)]"
                  }`}
                  style={
                    type === option
                      ? { background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }
                      : undefined
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
              className="mt-2 w-full rounded-sm border bg-[var(--color-field)] px-[13px] py-[11px] font-sans text-sm text-[var(--color-foreground)] outline-none"
              style={{
                borderColor: fieldErrors.name
                  ? "var(--color-danger)"
                  : similarMods.length > 0
                    ? "var(--color-emphasis-bg)"
                    : "var(--color-border-strong)",
              }}
            />
            {fieldErrors.name && (
              <p className="mt-[6px] font-mono text-[10.5px]" style={{ color: "var(--color-danger-text)" }}>
                {fieldErrors.name}
              </p>
            )}
            {similarMods.length > 0 && (
              <div className="rounded-b-sm border border-t-0 border-[var(--color-border-strong)] bg-[var(--color-field)]">
                <div className="border-b border-[var(--color-border-hairline)] px-[13px] py-[7px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  DÉJÀ DANS LE CATALOGUE ?
                </div>
                {similarMods.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-[11px] border-b border-[var(--color-border-hairline)] px-[13px] py-[9px] last:border-b-0"
                  >
                    <ModThumbnail src={entry.imageUrl ?? undefined} name={entry.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-sans text-[13px] font-semibold text-[var(--color-foreground)]">
                        {entry.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                        <TypeBadge type={toUiModType(entry.type)} />
                        {entry.tags.length > 0 && <> · {entry.tags.join(", ")}</>} · par{" "}
                        {entry.author.username}
                      </div>
                    </div>
                    {/* US-D3 — « Voir la fiche existante » : compléter plutôt que
                        dupliquer. La saisie part avec, et `?brouillon=1` dit à la fiche
                        d'afficher le retour au formulaire. */}
                    <Link
                      href={`/mods/${entry.id}?brouillon=1`}
                      onClick={keepDraft}
                      className="btn-solid flex-none rounded-sm bg-[var(--color-emphasis-bg)] px-[10px] py-[6px] font-sans text-[11px] font-medium text-[var(--color-emphasis-text)]"
                    >
                      Voir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              LIEN EXTERNE — FACULTATIF
            </div>
            <input
              ref={urlInputRef}
              name="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                // Le lien a changé : l'avertissement affiché ne le concerne plus.
                urlDuplicate.reset();
              }}
              // Une URL ne veut rien dire à moitié saisie : on vérifie quand le champ
              // est quitté, et au collage — la façon dont un lien arrive presque
              // toujours dans ce champ.
              onBlur={(event) => urlDuplicate.check(event.target.value)}
              // L'événement de collage précède l'insertion du texte : on relit le champ
              // au tour suivant, une fois la valeur à jour.
              onPaste={() => {
                setTimeout(() => urlDuplicate.check(urlInputRef.current?.value ?? ""), 0);
              }}
              aria-invalid={Boolean(fieldErrors.url)}
              placeholder="https://www.racedepartment.com/downloads/…"
              className="mt-2 w-full rounded-sm border bg-[var(--color-field)] px-[13px] py-[11px] font-mono text-xs text-[var(--color-foreground)] outline-none"
              style={{
                borderColor:
                  fieldErrors.url || urlDuplicate.match
                    ? "var(--color-danger)"
                    : "var(--color-border-strong)",
              }}
            />
            {fieldErrors.url && (
              <p className="mt-[6px] font-mono text-[10.5px]" style={{ color: "var(--color-danger-text)" }}>
                {fieldErrors.url}
              </p>
            )}
            {/* Le lien n'est plus exigé : proposer un mod de mémoire vaut mieux que ne
                pas le proposer. Mais la fiche restera signalée comme incomplète au
                catalogue tant que personne ne l'aura posé — autant le dire ici. */}
            {!fieldErrors.url && url.trim() === "" && (
              <p className="mt-[6px] font-mono text-[10.5px] leading-[1.5] text-[var(--color-text-muted)]">
                Sans lien, la fiche part quand même — elle portera un ⚠ au catalogue
                jusqu&apos;à ce que quelqu&apos;un l&apos;ajoute.
              </p>
            )}
            {/* US-D2/D3 — le lien est déjà enregistré : on avertit, on ne bloque pas. */}
            {urlDuplicate.match && (
              <div
                className="mt-2 flex gap-[11px] rounded-sm border p-3"
                style={{ borderColor: "var(--color-border-strong)", borderLeft: "3px solid var(--color-danger)", background: "var(--color-field)" }}
                role="alert"
              >
                <div className="flex-1">
                  <div className="font-sans text-[13px] font-semibold text-[var(--color-foreground)]">
                    Ce mod existe peut-être déjà
                  </div>
                  <div className="mt-1 font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-secondary)]">
                    Après nettoyage des paramètres de suivi, l&apos;URL correspond à{" "}
                    <span className="text-[var(--color-foreground)]">{urlDuplicate.match.name}</span>. Si c&apos;est
                    bien le même mod, complète la fiche existante plutôt que d&apos;en créer une
                    seconde : les votes et les tags resteront regroupés.
                  </div>
                </div>
                <div className="flex flex-none flex-col justify-center gap-[6px]">
                  <Link
                    href={`/mods/${urlDuplicate.match.id}?brouillon=1`}
                    onClick={keepDraft}
                    className="btn-solid whitespace-nowrap rounded-sm bg-[var(--color-emphasis-bg)] px-[11px] py-[7px] text-center font-sans text-[11px] font-semibold text-[var(--color-emphasis-text)]"
                  >
                    Voir la fiche existante
                  </Link>
                  {/* Variante, version alternative… : le lien saisi est conservé tel
                      quel, seul l'avertissement disparaît. */}
                  <button
                    type="button"
                    onClick={urlDuplicate.dismiss}
                    className="btn-outline whitespace-nowrap rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[7px] font-sans text-[11px] font-medium"
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
              className="mt-2 h-[62px] w-full rounded-sm border bg-[var(--color-field)] px-[13px] py-[11px] font-sans text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
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
              className="dropzone mt-[9px] flex h-24 cursor-pointer items-center justify-center rounded-sm border border-dashed border-[var(--color-border-dashed)] bg-cover bg-center font-mono text-[10px] text-[var(--color-text-muted)]"
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
                  className="link-underline flex-none border-b font-sans text-[11px] font-medium text-[var(--color-link)]"
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
              {currentSoiree && currentSoiree.voteClosedReason !== null ? (
                <p className="mt-[10px] font-mono text-[10px] leading-[1.6] text-[var(--color-text-muted)]">
                  {currentSoiree.voteClosedReason}
                </p>
              ) : currentSoiree ? (
                <div className="mt-[10px] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-sans text-xs font-semibold">
                      Soirée du {currentSoiree.dateLabel}
                    </div>
                    <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                      {currentSoiree.theme ? <>thème : {currentSoiree.theme}</> : "sans thème"}
                    </div>
                  </div>
                  <ToggleSwitch
                    on={engage}
                    onToggle={setEngage}
                    label={`Engager cette fiche dans la soirée du ${currentSoiree.dateLabel}`}
                  />
                </div>
              ) : (
                <p className="mt-[10px] font-mono text-[10px] leading-[1.6] text-[var(--color-text-muted)]">
                  Aucune soirée programmée — la fiche rejoindra le catalogue, et pourra
                  être engagée depuis la prochaine soirée créée.
                </p>
              )}
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
