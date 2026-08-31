import "server-only";
import type { ContributionKind, ModType as DbModType } from "@/lib/generated/prisma/enums";
import type { ModContribution } from "@/lib/mock-data";
import { prisma } from "@/lib/prisma";
import { formatContributionAge, formatLinkLabel } from "./format";
import { toUiModType } from "./type";

/**
 * Cahier §2.2 — le fil des contributions d'une fiche : ce que les membres y ont corrigé
 * après sa création, et qui.
 *
 * Deux choses vivent ici : ce qui **écrit** au fil (les routes d'édition l'appellent
 * après coup) et ce qui le **relit** pour la fiche. Les deux ensemble parce que la
 * phrase affichée est composée à la lecture — la base ne garde qu'un genre et un
 * détail : une formulation figée en base ne se corrigerait plus après coup, et se
 * traduirait encore moins.
 */

/**
 * Combien d'entrées la fiche déroule. Au-delà, elle compte sans afficher : le fil d'une
 * fiche très corrigée ne doit pas repousser l'historique des soirées hors de l'écran.
 */
export const MOD_CONTRIBUTIONS_PAGE = 12;

/** Un geste à inscrire au fil. Le détail dépend du genre — voir `describeContribution`. */
export interface ContributionRecord {
  kind: ContributionKind;
  detail?: string | null;
}

/**
 * L'état d'une fiche à un instant donné, réduit à ce qui se raconte. C'est de la
 * comparaison de deux de ces états que sortent les entrées du fil — et non du corps de
 * la requête : un PATCH qui renvoie la description à l'identique (le formulaire complet
 * renvoie tous les champs, US-B3) n'a rien corrigé, et ne doit rien laisser.
 */
export interface ModSnapshot {
  name: string;
  type: DbModType;
  url: string;
  description: string | null;
  imageUrl: string | null;
  /** Noms normalisés, dans n'importe quel ordre — la comparaison est ensembliste. */
  tags: string[];
}

/** Ce qu'il faut lire d'une fiche pour en prendre l'état, à passer tel quel à Prisma. */
export const MOD_SNAPSHOT_SELECT = {
  name: true,
  type: true,
  url: true,
  description: true,
  imageUrl: true,
  tags: { select: { tag: { select: { name: true } } } },
} as const;

/** L'état d'une fiche telle que `MOD_SNAPSHOT_SELECT` la ramène. */
export function toModSnapshot(mod: {
  name: string;
  type: DbModType;
  url: string;
  description: string | null;
  imageUrl: string | null;
  tags: { tag: { name: string } }[];
}): ModSnapshot {
  return {
    name: mod.name,
    type: mod.type,
    url: mod.url,
    description: mod.description,
    imageUrl: mod.imageUrl,
    tags: mod.tags.map(({ tag }) => tag.name),
  };
}

/**
 * US-B3 — ce qu'une édition a réellement changé, du point de vue du fil.
 *
 * Un même enregistrement peut porter plusieurs gestes (renommer *et* retirer un tag) :
 * chacun fait sa ligne, sans quoi le fil dirait « a modifié la fiche » et n'apprendrait
 * rien à personne.
 */
export function diffMod(before: ModSnapshot, after: ModSnapshot): ContributionRecord[] {
  const entries: ContributionRecord[] = [];

  // L'ancien nom, pas le nouveau : le nouveau est en haut de la fiche, sous les yeux du
  // lecteur. Ce qu'il ne peut plus retrouver, c'est celui d'avant.
  if (before.name !== after.name) entries.push({ kind: "NAME", detail: before.name });
  if (before.type !== after.type) entries.push({ kind: "TYPE", detail: toUiModType(after.type) });
  // Le domaine suffit à dire où mène le nouveau lien, et tient sur la ligne.
  if (before.url !== after.url) entries.push({ kind: "URL", detail: formatLinkLabel(after.url) });

  const description = transition(before.description, after.description);
  if (description) entries.push({ kind: DESCRIPTION_KINDS[description] });

  const image = transition(before.imageUrl, after.imageUrl);
  if (image) entries.push({ kind: IMAGE_KINDS[image] });

  const had = new Set(before.tags);
  const has = new Set(after.tags);
  for (const tag of after.tags) {
    if (!had.has(tag)) entries.push({ kind: "TAG_ADDED", detail: tag });
  }
  for (const tag of before.tags) {
    if (!has.has(tag)) entries.push({ kind: "TAG_REMOVED", detail: tag });
  }

  return entries;
}

type FieldTransition = "added" | "updated" | "removed";

const DESCRIPTION_KINDS = {
  added: "DESCRIPTION_ADDED",
  updated: "DESCRIPTION_UPDATED",
  removed: "DESCRIPTION_REMOVED",
} as const satisfies Record<FieldTransition, ContributionKind>;

const IMAGE_KINDS = {
  added: "IMAGE_ADDED",
  updated: "IMAGE_UPDATED",
  removed: "IMAGE_REMOVED",
} as const satisfies Record<FieldTransition, ContributionKind>;

/**
 * Un champ facultatif ne change pas d'une seule façon : le remplir, le remplacer et le
 * vider sont trois gestes différents, et la fiche les raconte différemment.
 */
function transition(before: string | null, after: string | null): FieldTransition | null {
  if (before === after) return null;
  if (!before) return "added";
  if (!after) return "removed";
  return "updated";
}

/**
 * Inscrit des gestes au fil d'une fiche.
 *
 * N'échoue jamais bruyamment, pour la même raison que le journal des suppressions
 * (lib/admin/deletion-log.ts) : l'édition, elle, est déjà enregistrée — la renvoyer en
 * erreur 500 parce que sa trace n'a pas pu s'écrire ferait perdre au membre une
 * correction bel et bien passée. L'échec reste dans les logs du serveur.
 *
 * À appeler **après** l'écriture : une édition refusée ne doit pas laisser derrière elle
 * la trace d'une correction qui n'a pas eu lieu.
 */
export async function recordContributions(
  modId: string,
  authorId: string,
  entries: ContributionRecord[],
): Promise<void> {
  if (entries.length === 0) return;

  try {
    await prisma.modContribution.createMany({
      data: entries.map((entry) => ({
        modId,
        authorId,
        kind: entry.kind,
        detail: entry.detail ?? null,
      })),
    });
  } catch (error) {
    console.error("Fil des contributions", error);
  }
}

/** Le même appel pour un geste isolé (ajout ou retrait d'un lien secondaire). */
export function recordContribution(
  modId: string,
  authorId: string,
  entry: ContributionRecord,
): Promise<void> {
  return recordContributions(modId, authorId, [entry]);
}

/**
 * Le même geste, inscrit au fil de plusieurs fiches à la fois — ce que fait la
 * suppression d'un tag (US-K2), qui le retire de toutes celles qui le portaient.
 *
 * Le journal des suppressions garde la trace côté admin, mais il ne se lit pas depuis
 * une fiche : sans ces entrées, une pastille disparaîtrait des fiches sans que rien n'y
 * dise pourquoi.
 */
export async function recordContributionOnMods(
  modIds: string[],
  authorId: string,
  entry: ContributionRecord,
): Promise<void> {
  if (modIds.length === 0) return;

  try {
    await prisma.modContribution.createMany({
      data: modIds.map((modId) => ({
        modId,
        authorId,
        kind: entry.kind,
        detail: entry.detail ?? null,
      })),
    });
  } catch (error) {
    console.error("Fil des contributions", error);
  }
}

/**
 * La phrase affichée, composée du genre et du détail. Le sujet manque volontairement :
 * la fiche met le pseudo devant (« Tibo · a ajouté le tag s-body »).
 *
 * Le détail peut manquer — une entrée écrite avant que le genre n'en porte un, un tag
 * effacé depuis : la phrase reste vraie sans lui, en moins précise.
 */
export function describeContribution(kind: ContributionKind, detail: string | null): string {
  const about = detail ? ` (${detail})` : "";

  switch (kind) {
    case "NAME":
      return detail ? `a renommé la fiche (avant : ${detail})` : "a renommé la fiche";
    case "TYPE":
      return detail ? `a changé le type en ${detail}` : "a changé le type de la fiche";
    case "URL":
      return `a remplacé le lien principal${about}`;
    case "DESCRIPTION_ADDED":
      return "a ajouté la description";
    case "DESCRIPTION_UPDATED":
      return "a complété la description";
    case "DESCRIPTION_REMOVED":
      return "a retiré la description";
    case "IMAGE_ADDED":
      return "a ajouté l'image d'aperçu";
    case "IMAGE_UPDATED":
      return "a remplacé l'image d'aperçu";
    case "IMAGE_REMOVED":
      return "a retiré l'image d'aperçu";
    case "TAG_ADDED":
      return detail ? `a ajouté le tag ${detail}` : "a ajouté un tag";
    case "TAG_REMOVED":
      return detail ? `a retiré le tag ${detail}` : "a retiré un tag";
    case "LINK_ADDED":
      return `a ajouté un lien alternatif${about}`;
    case "LINK_REMOVED":
      return `a retiré un lien alternatif${about}`;
  }
}

/** Le fil d'une fiche, tel que la fiche l'affiche. */
export interface ModContributionFeed {
  /** Les plus récentes d'abord, au plus `MOD_CONTRIBUTIONS_PAGE`. */
  entries: ModContribution[];
  /** Total, création comprise — le compteur en tête du bloc. */
  total: number;
  /** Entrées plus anciennes que celles renvoyées : la fiche affiche « + N ». */
  olderCount: number;
}

const EMPTY_FEED: ModContributionFeed = { entries: [], total: 0, olderCount: 0 };

/**
 * Le fil d'une fiche, création comprise.
 *
 * La création n'est pas une ligne de `ModContribution` : `Mod.authorId` et
 * `Mod.createdAt` la portent déjà, et pour *toutes* les fiches — y compris celles
 * créées avant que cette table n'existe, qui autrement ouvriraient leur fil sur du
 * vide. Elle est donc reconstituée ici, en queue de fil, là où elle appartient : c'est
 * toujours le geste le plus ancien.
 *
 * Une seule requête : le fil et la fiche qui le porte se lisent ensemble.
 */
export async function listModContributions(
  modId: string,
  now: Date = new Date(),
): Promise<ModContributionFeed> {
  const mod = await prisma.mod.findUnique({
    where: { id: modId },
    select: {
      createdAt: true,
      author: { select: { username: true } },
      _count: { select: { contributions: true } },
      contributions: {
        orderBy: { createdAt: "desc" },
        take: MOD_CONTRIBUTIONS_PAGE,
        select: {
          id: true,
          kind: true,
          detail: true,
          createdAt: true,
          author: { select: { username: true } },
        },
      },
    },
  });

  if (!mod) return EMPTY_FEED;

  const entries: ModContribution[] = mod.contributions.map((entry) => ({
    author: entry.author.username,
    action: describeContribution(entry.kind, entry.detail),
    whenLabel: formatContributionAge(entry.createdAt, now),
  }));

  // La création ferme le fil, mais seulement quand on est arrivé jusqu'à elle : sur une
  // fiche très corrigée, la page ne descend pas jusque-là et elle compte dans le « + N ».
  if (entries.length < MOD_CONTRIBUTIONS_PAGE) {
    entries.push({
      author: mod.author.username,
      action: "a créé la fiche",
      whenLabel: formatContributionAge(mod.createdAt, now),
    });
  }

  const total = mod._count.contributions + 1;

  return { entries, total, olderCount: total - entries.length };
}
