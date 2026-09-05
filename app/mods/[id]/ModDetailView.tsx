"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { BreadcrumbHeader } from "@/components/BreadcrumbHeader";
import { DashedAddChip } from "@/components/DashedAddChip";
import { DeleteModButton } from "@/components/DeleteModButton";
import { EngageModButton } from "@/components/EngageModButton";
import { MiniBarChart } from "@/components/MiniBarChart";
import { ModFilePanel } from "@/components/ModFilePanel";
import { ModInlineImageEdit } from "@/components/ModInlineImageEdit";
import { ModInlineLinksEdit } from "@/components/ModInlineLinksEdit";
import { ModInlineTagsEdit } from "@/components/ModInlineTagsEdit";
import { ModInlineTextEdit } from "@/components/ModInlineTextEdit";
import { TagPill } from "@/components/TagPill";
import { TypeBadge } from "@/components/TypeBadge";
import { UserAvatar } from "@/components/UserAvatar";
import type { Mod, ModContribution, ModPlayedAt } from "@/lib/mock-data";
import { PageLoader } from "@/components/PageLoader";
import type { ApiMod } from "@/lib/mods/serialize";
import { useVote } from "@/lib/mods/useVote";
import { apiModToView } from "@/lib/mods/view";
import { voteDisabledReason } from "@/lib/mods/vote";
import { useRequireAuth } from "@/lib/useRequireAuth";

interface ModDetailViewProps {
  /** Chargé côté serveur : depuis la base, ou à défaut depuis les données mock. */
  mod: Mod | undefined;
  /**
   * Lien vers le formulaire d'édition (US-B3). Absent pour les fiches de
   * démonstration, qui ne vivent qu'en dur et n'ont rien à éditer.
   */
  editHref?: string;
  /** Vrai si le membre connecté est l'auteur de la fiche, ou un admin (US-B4). */
  canDelete?: boolean;
  /**
   * Vrai quand on arrive ici depuis la détection de doublons du formulaire (US-D3) :
   * une saisie attend dans l'onglet, la fiche propose de la reprendre.
   */
  hasPendingDraft?: boolean;
  /**
   * Cahier §2.2 — le fil des corrections de la fiche, création comprise, les plus
   * récentes d'abord. `total` compte tout le fil et `olderCount` ce que la page ne
   * déroule pas : le bloc annonce un nombre, pas une longueur de liste.
   *
   * Une prop à part, et non un champ de `mod` : la fiche est réécrite en place après
   * chaque retouche (US-B3), à partir de ce que renvoie l'API — qui ne porte pas le
   * fil. Rangé dans `mod`, le bloc disparaîtrait le temps que le rendu serveur
   * rattrape.
   */
  contributions?: { entries: ModContribution[]; total: number; olderCount: number };
  /** Cahier §2.5 — les soirées où la fiche a déjà été jouée, la plus récente d'abord. */
  playedAt?: { entries: ModPlayedAt[]; olderCount: number };
  /**
   * La soirée en cours (US-G2/G3), ou `null` s'il n'y en a aucune de programmée. Elle
   * sert deux fois : elle distingue « pas engagé » de « aucune soirée » dans le panneau
   * de vote, et c'est elle qu'on engage la fiche depuis le bloc d'actions.
   */
  currentSoiree?: {
    id: string;
    dateLabel: string;
    /**
     * Pourquoi le vote du soir est fermé (30 min avant le départ), `null` tant qu'il est
     * ouvert. Le panneau éteint alors son bouton et affiche cette phrase — la même que
     * celle que la route rendrait en 409.
     */
    voteClosedReason: string | null;
  } | null;
  /**
   * US-H1/US-K3 — le plafond d'upload du moment, en octets, tel que l'espace admin
   * l'a réglé. Il descend du serveur avec la page : la fiche l'affiche au membre avant
   * qu'il choisisse un fichier, et refuse le fichier de trop sans aller-retour. La
   * route le relit en base au moment de signer — c'est elle qui tranche.
   */
  maxModFileBytes: number;
}

const TYPE_PLURAL = { vehicule: "Véhicules", circuit: "Circuits" } as const;

/**
 * Le champ ouvert en retouche (US-B3), ou `null` quand la fiche est en lecture.
 *
 * Un seul à la fois : deux champs ouverts en même temps donneraient deux « Enregistrer »
 * à l'écran, et l'un des deux partirait avec une valeur que l'autre vient de changer.
 */
type EditableField = "description" | "url" | "links" | "tags" | "image";

/**
 * Cahier §2.2 — la fiche n'a pas de lien externe, le champ étant facultatif.
 *
 * Le même ⚠ qu'au catalogue, mais ici il y a la place de dire quoi faire : le bloc est
 * le bouton qui ouvre la saisie du lien. Sans `onAdd` — les fiches de démonstration,
 * qui ne s'éditent pas — il ne reste que le constat, et rien à cliquer.
 */
function MissingPrimaryLink({ onAdd }: { onAdd?: () => void }) {
  const content = (
    <>
      <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
        ⚠ LIEN PRINCIPAL MANQUANT
      </span>
      <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
        {onAdd ? "ajouter le lien du mod" : "aucun lien sur cette fiche"}
      </span>
    </>
  );
  const className = "flex min-w-[150px] flex-col gap-[3px] rounded-sm border px-3 py-[9px] text-left";
  const style = { borderColor: "var(--color-amber)" };

  if (!onAdd) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }

  return (
    <button type="button" onClick={onAdd} className={`btn-outline ${className}`} style={style}>
      {content}
    </button>
  );
}

/**
 * US-F1 / US-F2 — le vote depuis la fiche, et le compte de ceux qui ont déjà voté.
 *
 * Le MVP vote « sans notion formelle de soirée » (cahier §6) : le compteur porte donc
 * sur la fiche elle-même, pas sur une soirée. Le panneau reprendra le titre d'une
 * soirée quand l'Epic G lui en donnera une.
 *
 * Les avatars des autres votants ne sont pas chargés — la fiche ne connaît que leur
 * nombre : ils restent en pastilles neutres, le seul visage affiché est celui du
 * membre connecté quand il a voté.
 */
function VotePanel({
  mod,
  viewer,
  hasCurrentSoiree,
  voteClosedReason,
}: {
  mod: Mod;
  viewer?: { name?: string | null; image?: string | null };
  hasCurrentSoiree: boolean;
  /** Voir `ModDetailViewProps.currentSoiree` — `null` quand le vote est ouvert. */
  voteClosedReason: string | null;
}) {
  const { soireeVotes, myVotes, isPending, error, add, remove } = useVote(mod.id, {
    votes: mod.totalVotes,
    soireeVotes: mod.engagement?.votes ?? 0,
    myVotes: mod.myVotes ?? 0,
  });
  // US-G3 — seuls les mods engagés dans la soirée en cours sont votables, et seulement
  // tant que le vote du soir est ouvert : il ferme 30 min avant le départ.
  const isEngaged = mod.engagement != null;
  const canVote = isEngaged && voteClosedReason === null;
  // Les voix des autres : le score du soir moins la pile de ce membre, qui peut compter
  // plusieurs voix sur cette seule fiche.
  const others = soireeVotes - myVotes;

  return (
    <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[18px]">
      <div className="flex items-end justify-between">
        <div>
          {/* US-G3 — le compteur est celui de la soirée en cours, et il repart de zéro
              à chaque nouvelle. L'historique, lui, est dans les barres à droite. */}
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            {isEngaged ? "VOTES CE SOIR" : "SOIRÉES PRÉCÉDENTES"}
          </div>
          <div className="mt-1 font-mono text-4xl leading-none">
            {isEngaged ? soireeVotes : "—"}
          </div>
        </div>
        <MiniBarChart values={mod.voteHistory} height={36} dimmed={mod.totalVotes === 0} />
      </div>
      {canVote ? (
        /* Un « − » à côté de l'action principale, plutôt qu'un incrémenteur symétrique :
           ajouter reste le geste courant, et il garde toute la largeur. Le retrait est
           toujours là mais éteint tant qu'il n'a rien à défaire. */
        <div className="mt-4 flex items-stretch gap-2" style={{ opacity: isPending ? 0.7 : 1 }}>
          <button
            type="button"
            onClick={remove}
            disabled={myVotes === 0}
            aria-label="Retirer un vote pour ce mod"
            className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-4 font-sans text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-30"
          >
            −
          </button>
          <button
            type="button"
            onClick={add}
            aria-busy={isPending}
            aria-label="Ajouter un vote pour ce mod"
            className={`flex flex-1 items-center justify-center gap-2 rounded-sm p-3 font-sans text-sm font-semibold ${
              myVotes > 0
                ? "btn-solid bg-[var(--color-amber)] text-[var(--color-ink)]"
                : "btn-outline border border-[var(--color-border-strong)]"
            }`}
          >
            {myVotes === 0
              ? "+1 Voter pour ce mod"
              : `✓ ${myVotes} vote${myVotes > 1 ? "s" : ""} placé${myVotes > 1 ? "s" : ""} — en ajouter un`}
          </button>
        </div>
      ) : (
        /* Pas de bouton éteint : il annoncerait un score qui n'existe pas. À la place,
           la raison — elle n'est pas la même selon qu'une soirée est ouverte ou non. */
        <p className="mt-4 rounded-sm border border-dashed border-[var(--color-border-dashed)] p-3 text-center font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-muted)]">
          {voteDisabledReason(hasCurrentSoiree, voteClosedReason)}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 font-mono text-[10px] leading-[1.5] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-[5px]">
        {myVotes > 0 && <UserAvatar src={viewer?.image} name={viewer?.name} size={20} ring />}
        {/* Au-delà de quatre pastilles, la ligne déborde — le compte, lui, est écrit. */}
        {Array.from({ length: Math.min(others, 4) }, (_, index) => (
          <AvatarPlaceholder key={index} size={20} />
        ))}
        <span className="ml-1 font-mono text-[10px] text-[var(--color-text-muted)]">
          {!isEngaged
            ? "pas engagé dans la soirée en cours"
            : soireeVotes === 0
            ? "personne n'a encore voté"
            : others === 0
              ? "toi seul pour l'instant"
              : `${myVotes > 0 ? "+ " : ""}${others} autre${others > 1 ? "s" : ""} membre${others > 1 ? "s" : ""}`}
        </span>
      </div>
    </div>
  );
}

export function ModDetailView({
  mod: serverMod,
  editHref,
  canDelete = false,
  hasPendingDraft = false,
  contributions = { entries: [], total: 0, olderCount: 0 },
  playedAt = { entries: [], olderCount: 0 },
  currentSoiree = null,
  maxModFileBytes,
}: ModDetailViewProps) {
  const { session, isLoading } = useRequireAuth();
  const router = useRouter();
  // US-B3 — les corrections se font sur la fiche, sans passer par le formulaire complet.
  const [editing, setEditing] = useState<EditableField | null>(null);
  // La fiche telle que la route l'a réécrite. Elle l'emporte sur celle du serveur, qui
  // date de l'ouverture de la page : `router.refresh()` la rattrapera, mais plus tard,
  // et le champ ne doit pas se rafficher une seconde dans son ancienne version.
  const [editedMod, setEditedMod] = useState<Mod | null>(null);
  // L'URL d'aperçu qui n'a rien ramené : `Mod.imageUrl` peut pointer vers un objet que
  // le bucket n'a plus (fichier retiré à la main, bucket recréé). On retombe alors sur
  // le motif rayé, comme une fiche sans image — même parti pris que `ModThumbnail`.
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  const mod = editedMod ?? serverMod;

  /** Une écriture aboutie, la retouche restant ouverte (retrait d'un lien secondaire). */
  function handleChanged(updated: ApiMod) {
    setEditedMod(apiModToView(updated));
    // La fiche est aussi rendue ailleurs (catalogue, soirée, fil d'Ariane) : on
    // redemande le rendu serveur plutôt que de laisser deux versions cohabiter.
    router.refresh();
  }

  function handleSaved(updated: ApiMod) {
    handleChanged(updated);
    setEditing(null);
  }

  if (isLoading) {
    return <PageLoader />;
  }

  if (!mod) {
    return (
      <div className="flex min-h-screen flex-col">
        <BreadcrumbHeader crumbs={[{ label: "Catalogue", href: "/catalogue" }, { label: "Fiche introuvable" }]} />
        <div className="page-shell p-4 sm:p-8">
          <p className="font-sans text-sm">Cette fiche n&apos;existe pas ou a été supprimée.</p>
          <Link
            href="/catalogue"
            className="link-underline mt-3 inline-block font-sans text-sm text-[var(--color-link)]"
          >
            Retour au catalogue
          </Link>
        </div>
      </div>
    );
  }

  // La création n'est pas une modification : sur une fiche que personne n'a encore
  // corrigée, le fil ne contient qu'elle, et « dernière modif » redirait l'auteur
  // affiché juste au-dessus.
  const lastContribution = contributions.total > 1 ? contributions.entries[0] : undefined;
  // US-H1 — le dépôt d'un fichier suppose une fiche réelle (les fiches de démonstration
  // n'ont rien à recevoir) *et* un engagement dans la soirée en cours. `engagement` est
  // exactement ça : non nul quand la fiche est au programme du soir.
  const canUploadFile = editHref !== undefined && mod.engagement != null;
  const previewUrl = mod.imageUrl && mod.imageUrl !== failedImageUrl ? mod.imageUrl : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <BreadcrumbHeader
        crumbs={[
          { label: "Catalogue", href: "/catalogue" },
          { label: TYPE_PLURAL[mod.type], href: "/catalogue" },
          { label: mod.name },
        ]}
        actions={
          <Link
            href="/mods/nouveau"
            className="btn-solid rounded-sm px-[14px] py-2 font-sans text-xs font-semibold"
            style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
          >
            Proposer un mod
          </Link>
        }
      />

      {/* US-D3 — la sortie « Créer quand même », vue depuis la fiche suspecte : soit ce
          mod est bien le même et il suffit de le compléter, soit c'en est un autre et
          la saisie repart d'où elle s'était arrêtée. */}
      {hasPendingDraft && (
        <div className="page-shell px-4 pt-4 sm:px-[20px] sm:pt-[20px]">
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-sm border bg-[var(--color-surface)] p-3"
            style={{
              borderColor: "var(--color-border-strong)",
              borderLeft: "3px solid var(--color-amber)",
            }}
            role="status"
          >
            <div className="min-w-0 flex-1 sm:min-w-[240px]">
              <div className="font-sans text-[13px] font-semibold">
                Ta fiche en cours t&apos;attend
              </div>
              <div className="mt-1 font-mono text-[10.5px] leading-[1.6] text-[var(--color-text-secondary)]">
                Tu es venu vérifier si ce mod existait déjà. Si c&apos;est bien le même,
                complète cette fiche plutôt que d&apos;en créer une seconde — les votes et
                les tags resteront regroupés. Sinon, reprends ta saisie là où tu
                l&apos;as laissée.
              </div>
            </div>
            <Link
              href="/mods/nouveau"
              className="btn-solid flex-none rounded-sm px-[14px] py-2 font-sans text-xs font-semibold"
              style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
            >
              Reprendre ma fiche
            </Link>
          </div>
        </div>
      )}

      <div className="page-shell grid grid-cols-1 gap-[18px] p-4 sm:p-[20px] lg:grid-cols-[1fr_336px]">
        <div className="flex flex-col gap-[14px]">
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="p-4 pb-4 sm:p-5">
              <div className="flex items-center gap-[9px]">
                <TypeBadge type={mod.type} as="pill" />
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  fiche #{mod.id.slice(0, 3).toUpperCase()} · créée le {mod.createdAtLabel}
                </span>
              </div>
              <h1 className="mt-[10px] text-pretty font-sans text-[25px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[32px] sm:leading-[1.05]">
                {mod.name}
              </h1>
              {editing === "tags" ? (
                <ModInlineTagsEdit
                  modId={mod.id}
                  initialTags={mod.tags}
                  onSaved={handleSaved}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="mt-3 flex flex-wrap gap-[5px]">
                  {mod.tags.map((tag) => (
                    <TagPill key={tag} label={tag} href={`/catalogue?tags=${tag}`} />
                  ))}
                  {/* US-B3 — le champ s'ouvre ici, avec la même autocomplétion que le
                      formulaire (US-C1) : ajouter un tag ne vaut pas de quitter la fiche. */}
                  {editHref && (
                    <DashedAddChip label="+ ajouter un tag" onClick={() => setEditing("tags")} />
                  )}
                </div>
              )}
            </div>
            <div
              // L'aperçu garde son cadre paysage, mais pas sa hauteur fixe : 250 px sur
              // un écran de téléphone, c'est un tiers de la page avant d'avoir lu la
              // description.
              //
              // Au-delà du téléphone, la colonne dépasse le millier de pixels : à hauteur
              // fixe, `object-cover` y taillait une bande de 4:1 au milieu de l'image —
              // un mod photographié de trois quarts y perdait ses roues. À partir de `sm`
              // l'image est donc posée entière, centrée sur une copie floutée d'elle-même
              // qui, elle, remplit le cadre : aucun format d'origine n'est sacrifié, et le
              // bandeau reste plein sans bordure vide.
              className="relative flex h-[170px] items-end justify-between overflow-hidden border-y border-[var(--color-border)] bg-[var(--color-surface)] px-[14px] py-[10px] sm:h-[340px]"
              style={{
                backgroundImage: previewUrl
                  ? undefined
                  : "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 7px, var(--color-placeholder-b) 7px 14px)",
              }}
            >
              {previewUrl ? (
                <>
                  {/* Le fond : même `src` et mêmes `sizes` que l'aperçu, donc la même URL
                      optimisée — le navigateur ne télécharge qu'une image. L'agrandissement
                      évite que le flou laisse voir les bords du cadre. */}
                  <Image
                    src={previewUrl}
                    alt=""
                    aria-hidden
                    fill
                    sizes="(max-width: 1024px) 100vw, 700px"
                    loading="eager"
                    className="hidden scale-125 object-cover opacity-40 blur-2xl sm:block"
                  />
                  {/* L'image nette, centrée dans le cadre. Pas de `fill` ici : le masque
                      de `.preview-edge-fade` suit la boîte de l'élément, il faut donc que
                      cette boîte épouse l'image — d'où le dimensionnement par le format
                      d'origine, plafonné au cadre, plutôt qu'un `object-contain` étiré sur
                      toute la largeur. `width` et `height` ne servent qu'à réserver un
                      rapport avant le chargement ; le format réel prend le relais ensuite,
                      sans décaler la page puisque le cadre a une hauteur fixe. */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image
                      src={previewUrl}
                      alt={`Aperçu de ${mod.name}`}
                      width={1600}
                      height={900}
                      sizes="(max-width: 1024px) 100vw, 700px"
                      // Aperçu en haut de fiche : c'est l'élément LCP, il ne doit pas
                      // attendre le lazy-loading par défaut de `next/image`.
                      loading="eager"
                      onError={() => setFailedImageUrl(previewUrl)}
                      className="preview-edge-fade h-full w-full object-cover sm:h-auto sm:max-h-full sm:w-auto sm:max-w-full"
                    />
                  </div>
                </>
              ) : (
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  aperçu du mod — image déposée par un membre
                </span>
              )}
              {editHref && editing !== "image" && (
                <button
                  type="button"
                  onClick={() => setEditing("image")}
                  className="btn-outline relative ml-auto rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-secondary)]"
                >
                  remplacer l&apos;image
                </button>
              )}
            </div>
            {editing === "image" && (
              <div className="border-b border-[var(--color-border)] p-4 sm:p-5">
                <ModInlineImageEdit
                  modId={mod.id}
                  currentImageUrl={mod.imageUrl ?? null}
                  onSaved={handleSaved}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}
            <div className="p-4 sm:p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  DESCRIPTION
                </div>
                {editHref && editing !== "description" && (
                  <button
                    type="button"
                    onClick={() => setEditing("description")}
                    className="link-underline border-b font-mono text-[10px] text-[var(--color-link)]"
                    style={{ borderColor: "var(--color-amber)" }}
                  >
                    modifier
                  </button>
                )}
              </div>
              {editing === "description" ? (
                <ModInlineTextEdit
                  modId={mod.id}
                  field="description"
                  initialValue={mod.description ?? ""}
                  multiline
                  placeholder="Ce qu'il faut savoir avant de l'installer : version, pack de textures requis, physique…"
                  hint="Champ laissé vide : la description disparaît de la fiche. Échap annule."
                  onSaved={handleSaved}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <p className="mt-[9px] max-w-[640px] text-pretty font-sans text-sm leading-[1.65] text-[var(--color-text-secondary)]">
                  {mod.description ?? "Pas encore de description — n'importe quel membre peut en ajouter une."}
                </p>
              )}
              {editing === "url" && (
                <div className="mt-[14px] max-w-[520px] border-t border-[var(--color-border-hairline)] pt-[14px]">
                  <div className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
                    LIEN PRINCIPAL
                  </div>
                  <ModInlineTextEdit
                    modId={mod.id}
                    field="url"
                    initialValue={mod.primaryLink?.href ?? mod.primaryLink?.url ?? ""}
                    placeholder="https://www.racedepartment.com/downloads/…"
                    hint="Le lien principal, celui du bouton de téléchargement. Pour un miroir ou un pack de textures, ajoute plutôt un lien secondaire. Champ laissé vide : la fiche repart sans lien, et le catalogue la signalera comme incomplète. Échap annule."
                    onSaved={handleSaved}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}

              {editing === "links" && (
                <ModInlineLinksEdit
                  modId={mod.id}
                  links={mod.altLinks ?? []}
                  onChanged={handleChanged}
                  onSaved={handleSaved}
                  onCancel={() => setEditing(null)}
                />
              )}

              {editing !== "url" && editing !== "links" && (
                <div className="mt-[14px] flex flex-wrap gap-2 border-t border-[var(--color-border-hairline)] pt-[14px]">
                  {mod.primaryLink ? (
                    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-[3px] rounded-sm border border-[var(--color-border)] px-3 py-[9px] sm:min-w-[150px] sm:flex-none">
                      <span className="flex items-baseline gap-3 font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
                        LIEN PRINCIPAL
                        {editHref && (
                          <button
                            type="button"
                            onClick={() => setEditing("url")}
                            className="link-underline ml-auto border-b tracking-normal text-[var(--color-link)]"
                            style={{ borderColor: "var(--color-amber)" }}
                          >
                            modifier
                          </button>
                        )}
                      </span>
                      <span className="truncate font-mono text-[11px]">{mod.primaryLink.url}</span>
                    </div>
                  ) : (
                    /* Cahier §2.2 — le lien est facultatif, et celle-ci n'en a pas. */
                    <MissingPrimaryLink onAdd={editHref ? () => setEditing("url") : undefined} />
                  )}
                  {/* Cahier §2.2 — les liens qu'un autre membre a ajoutés. Cliquables :
                      seul le lien principal a son bouton de téléchargement à côté. */}
                  {mod.altLinks?.map((link) => (
                    <a
                      key={link.id ?? link.url}
                      href={link.href ?? `https://${link.url}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn-outline flex min-w-0 max-w-full flex-1 flex-col gap-[3px] rounded-sm border border-[var(--color-border)] px-3 py-[9px] sm:min-w-[150px] sm:flex-none"
                    >
                      <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
                        {link.label.toUpperCase()} ↗
                      </span>
                      <span className="truncate font-mono text-[11px]">{link.url}</span>
                      {link.addedBy && (
                        <span className="font-mono text-[9.5px] text-[var(--color-text-faint)]">
                          ajouté par {link.addedBy}
                        </span>
                      )}
                    </a>
                  ))}
                  {editHref && (
                    <DashedAddChip label="+ lien" onClick={() => setEditing("links")} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cahier §2.2 — l'usage wiki, rendu lisible : qui est passé sur cette fiche.
              Le fil porte toujours au moins la création, il n'y a donc pas de cas vide
              pour une fiche en base. */}
          {contributions.entries.length > 0 && (
            <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  CONTRIBUTIONS · {contributions.total}
                </div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  tout le monde peut corriger cette fiche
                </div>
              </div>
              <div className="mt-3 flex flex-col">
                {contributions.entries.map((entry, index) => (
                  <div
                    key={`${entry.author}-${index}`}
                    // Trois colonnes fixes tiennent mal sur 320 px de large : sous `sm`
                    // les trois valeurs coulent sur la même ligne, et passent à la ligne
                    // d'elles-mêmes si l'action est longue.
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-[2px] border-b border-[var(--color-border-hairline)] py-2 last:border-b-0 sm:grid sm:grid-cols-[100px_1fr_92px] sm:items-center sm:gap-3"
                  >
                    <span className="truncate font-mono text-[10px]">{entry.author}</span>
                    <span className="font-sans text-xs text-[var(--color-text-secondary)]">{entry.action}</span>
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">{entry.whenLabel}</span>
                  </div>
                ))}
              </div>
              {contributions.olderCount > 0 && (
                <div className="mt-2 font-mono text-[10px] text-[var(--color-text-faint)]">
                  + {contributions.olderCount} plus ancienne
                  {contributions.olderCount > 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* Cahier §2.5 — l'historique (US-I1) vu depuis la fiche : les soirées où ce
              mod a déjà tourné, et ce qu'il y a fait. Les soirées à venir n'y sont pas,
              y compris celle de ce soir : le vote y est encore ouvert, le rang ne
              voudrait rien dire. */}
          {playedAt.entries.length > 0 && (
            <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                DÉJÀ JOUÉ LORS DE
              </div>
              <div className="mt-[11px] flex flex-wrap items-start gap-[10px]">
                {playedAt.entries.map((entry) => {
                  const content = (
                    <>
                      <div className="font-sans text-xs font-semibold">{entry.sessionLabel}</div>
                      <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {entry.rank}
                        {entry.rank === 1 ? "er" : "e"} · {entry.votes} vote
                        {entry.votes > 1 ? "s" : ""}
                      </div>
                      {entry.theme && (
                        <div className="font-mono text-[9.5px] text-[var(--color-text-faint)]">
                          {entry.theme}
                        </div>
                      )}
                    </>
                  );
                  const className = "rounded-sm border border-[var(--color-border)] px-3 py-[9px]";

                  // Les fiches de démonstration n'ont pas de soirée à ouvrir : leur
                  // vignette reste inerte plutôt que de mener à une page vide.
                  return entry.href ? (
                    <Link key={entry.href} href={entry.href} className={`btn-outline ${className}`}>
                      {content}
                    </Link>
                  ) : (
                    <div key={entry.sessionLabel} className={className}>
                      {content}
                    </div>
                  );
                })}
                {playedAt.olderCount > 0 && (
                  <span className="self-center font-mono text-[10px] text-[var(--color-text-faint)]">
                    + {playedAt.olderCount} soirée{playedAt.olderCount > 1 ? "s" : ""} plus
                    ancienne{playedAt.olderCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <VotePanel
            mod={mod}
            viewer={session?.user}
            hasCurrentSoiree={currentSoiree !== null}
            voteClosedReason={currentSoiree?.voteClosedReason ?? null}
          />

          {mod.primaryLink && (
            <a
              href={mod.primaryLink.href ?? `https://${mod.primaryLink.url}`}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-outline flex items-center justify-between rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[15px] py-[13px]"
            >
              <span>
                <span className="block font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
                  TÉLÉCHARGER — LIEN EXTERNE
                </span>
                <span className="mt-[3px] block font-sans text-[13px] font-semibold">
                  {mod.primaryLink.label} ↗
                </span>
              </span>
              <span className="font-mono text-base text-[var(--color-link)]">↗</span>
            </a>
          )}

          {/* US-H1 — le fichier déposé sur Cloudflare R2, et de quoi en déposer un.
              Le dépôt est réservé aux mods engagés dans la soirée en cours : un fichier
              ne vit que 24 h (cahier §2.7), le déposer ailleurs, c'est le voir expirer
              sans avoir servi. Le panneau ne s'affiche donc que là où il sert — sur une
              fiche engagée, ou sur une fiche qui porte déjà un fichier. */}
          {(mod.fileUpload || canUploadFile) && (
            <ModFilePanel
              modId={mod.id}
              file={mod.fileUpload}
              maxBytes={maxModFileBytes}
              canUpload={canUploadFile}
              hasCurrentSoiree={currentSoiree !== null}
              onUploaded={handleChanged}
            />
          )}

          <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[15px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">ACTIONS</div>
            <div className="mt-[10px] flex flex-col gap-[7px]">
              {editHref && (
                <Link
                  href={editHref}
                  className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-3 py-[9px] text-center font-sans text-xs font-medium"
                >
                  Modifier la fiche
                </Link>
              )}
              {/* US-G2 — seules les fiches en base s'engagent : celles de démonstration
                  ne vivent qu'en dur, l'API ne les connaît pas. Même condition que
                  l'édition, et pour la même raison. */}
              {editHref && (
                <EngageModButton
                  modId={mod.id}
                  soiree={currentSoiree}
                  isEngaged={mod.engagement != null}
                  closedReason={currentSoiree?.voteClosedReason ?? null}
                />
              )}
              {canDelete ? (
                <DeleteModButton modId={mod.id} modName={mod.name} />
              ) : (
                <span
                  className="rounded-sm px-3 py-[9px] font-sans text-xs font-medium opacity-60"
                  style={{ border: "1px solid var(--color-danger)", color: "var(--color-danger-text)" }}
                >
                  Supprimer — réservé à {mod.author} &amp; admins
                </span>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-1 font-mono text-[10px] leading-[1.6] text-[var(--color-text-muted)]">
            <UserAvatar src={mod.authorAvatarUrl} name={mod.author} size={16} />
            <span>
              Auteur d&apos;origine : {mod.author}.
              {lastContribution && ` Dernière modif : ${lastContribution.author}, ${lastContribution.whenLabel}.`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
