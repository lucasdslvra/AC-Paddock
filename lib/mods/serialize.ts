import type {
  ModLinkModel,
  ModModel,
  ModTagModel,
  SoireeModModel,
  TagModel,
  UserModel,
} from "@/lib/generated/prisma/models";
import type { CurrentSoiree } from "@/lib/soirees/current";

/**
 * Relations à charger avec une fiche pour pouvoir la sérialiser ou l'afficher.
 * Une seule construction partagée par toutes les lectures (routes API et pages) :
 * ajouter une relation ici la rend disponible partout, et `ModWithRelations` ne peut pas
 * se désynchroniser d'un `include` oublié quelque part.
 *
 * Les tags sortent triés par nom : l'ordre de la table d'association n'a aucun sens
 * pour un lecteur, et un ordre stable évite que les pastilles sautent d'une fiche à
 * l'autre après une édition.
 *
 * Le paramètre est l'identifiant Discord du membre connecté — celui que porte la
 * session, pas l'`id` de sa ligne `User`, qui n'existe pas forcément encore. Le filtre
 * passe donc par la relation : une jointure de plus, mais aucun aller-retour
 * supplémentaire pour savoir si ce membre a déjà voté (US-F1).
 */
export const MOD_VOTE_HISTORY_LENGTH = 7;

export function modInclude(viewerDiscordId: string, currentSoiree: CurrentSoiree | null) {
  return {
    author: true,
    tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
    // Le total des votes de la fiche, toutes soirées confondues. Il n'est plus affiché
    // — le compteur d'une carte est celui de la soirée en cours, et il repart de zéro à
    // chaque nouvelle — mais c'est lui que trie `MOD_ORDER_BY.votes` (US-E4) : un tri
    // sur le score du soir mettrait tout le catalogue à égalité hors soirée.
    _count: { select: { votes: true } },
    // Cahier §2.2 — les liens secondaires ajoutés par les membres, dans leur ordre
    // d'ajout : la fiche les affiche à la suite du lien principal, qui reste `url`.
    links: { include: { addedBy: true }, orderBy: { createdAt: "asc" } },
    // US-G2/G3/G4 — les dernières soirées où la fiche a été engagée, la plus récente
    // d'abord. Elles servent deux fois :
    //
    //   · la première est l'engagement dans la soirée en cours, s'il y en a un — c'est
    //     ce qui rend la fiche votable, et rien d'autre ;
    //   · les sept forment l'historique que dessinent les barres de la carte, seul
    //     endroit où se lit encore la popularité d'une fiche.
    //
    // La borne haute est la date de la soirée en cours, pas « les plus récentes » :
    // une soirée programmée dans trois semaines n'a pas eu lieu, ses zéros ne diraient
    // rien. Sans soirée en cours, la borne est maintenant — donc les soirées passées.
    soirees: {
      where: { soiree: { date: { lte: currentSoiree?.date ?? new Date() } } },
      orderBy: { soiree: { date: "desc" } },
      take: MOD_VOTE_HISTORY_LENGTH,
      include: {
        _count: { select: { votes: true } },
        votes: { where: { user: { discordId: viewerDiscordId } }, select: { id: true } },
      },
    },
  } as const;
}

/** Une fiche telle que `modInclude` la ramène. */
export type ModWithRelations = ModModel & {
  author: UserModel;
  tags: (ModTagModel & { tag: TagModel })[];
  _count: { votes: number };
  links: (ModLinkModel & { addedBy: UserModel })[];
  /**
   * Les `MOD_VOTE_HISTORY_LENGTH` dernières soirées où la fiche a été engagée, la plus
   * récente d'abord. La soirée en cours y figure en tête si la fiche y est engagée.
   */
  soirees: (SoireeModModel & {
    _count: { votes: number };
    /** Le vote du membre connecté dans cette soirée, s'il en a un. */
    votes: { id: string }[];
  })[];
};

/**
 * US-G3 — ce qu'il faut savoir pour voter depuis une carte ou une fiche : sur quelle
 * ligne le vote s'écrit, et où en est le compte dans la soirée. `null` quand la fiche
 * n'est pas engagée dans la soirée en cours, ou qu'aucune soirée n'est ouverte — le
 * bouton est alors désactivé, avec la raison.
 */
export interface ApiModEngagement {
  soireeModId: string;
  /** Votes de cette fiche **dans la soirée en cours** — pas son total (voir `votes`). */
  votes: number;
}

/**
 * Un lien secondaire de la fiche (cahier §2.2). Le lien principal, lui, reste le champ
 * `url` : il n'est pas dans cette liste.
 */
export interface ApiModLink {
  id: string;
  /** Intitulé saisi, ou `null` — la fiche affiche alors le domaine du lien. */
  label: string | null;
  url: string;
  /** Pseudo du membre qui l'a ajouté, que la fiche affiche sous le lien. */
  addedBy: string;
}

/** Forme d'un mod telle qu'exposée par l'API (dates sérialisées en ISO). */
export interface ApiMod {
  id: string;
  type: ModModel["type"];
  name: string;
  url: string;
  description: string | null;
  imageUrl: string | null;
  /** Noms des tags, sous leur forme normalisée (US-C1). */
  tags: string[];
  /**
   * Nombre total de votes de la fiche, tous membres et toutes soirées confondus.
   * Plus affiché nulle part comme un score — le compteur visible est celui de la
   * soirée en cours — mais c'est la clé du tri « par votes » du catalogue (US-E4).
   */
  votes: number;
  /**
   * US-G4 — les votes reçus lors des dernières soirées où la fiche a été engagée, de
   * la plus ancienne à la plus récente. Ce sont des comptes bruts : c'est l'interface
   * qui en fait des hauteurs de barres, elle seule sait sur quoi les rapporter.
   *
   * Au plus `MOD_VOTE_HISTORY_LENGTH` valeurs, et souvent moins : une fiche jamais
   * engagée n'en a aucune.
   */
  voteHistory: number[];
  /** Vrai si le membre qui a demandé la fiche a voté pour elle dans la soirée en cours. */
  hasVoted: boolean;
  /** US-G3 — `null` si la fiche n'est pas engagée dans la soirée en cours. */
  engagement: ApiModEngagement | null;
  /** Cahier §2.2 — les liens alternatifs, dans leur ordre d'ajout. */
  links: ApiModLink[];
  author: { discordId: string; username: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export function serializeMod(mod: ModWithRelations, currentSoireeId: string | null): ApiMod {
  // `soirees` arrive de la plus récente à la plus ancienne, bornée à la soirée en
  // cours : celle-ci ne peut donc être qu'en tête. On compare quand même l'identifiant
  // plutôt que de prendre `[0]` de confiance — une fiche non engagée ce soir a bien une
  // première entrée, mais c'est celle d'une soirée passée.
  const engagement = mod.soirees.find((entry) => entry.soireeId === currentSoireeId);

  return {
    id: mod.id,
    type: mod.type,
    name: mod.name,
    url: mod.url,
    description: mod.description,
    imageUrl: mod.imageUrl,
    // La table d'association ne sert qu'au stockage : l'API n'expose que les noms.
    tags: mod.tags.map(({ tag }) => tag.name),
    votes: mod._count.votes,
    // Les barres se lisent de gauche à droite dans l'ordre du temps : on retourne
    // l'ordre de la base, qui sert d'abord à trouver la soirée en cours.
    voteHistory: mod.soirees.map((entry) => entry._count.votes).reverse(),
    hasVoted: engagement !== undefined && engagement.votes.length > 0,
    engagement: engagement ? { soireeModId: engagement.id, votes: engagement._count.votes } : null,
    links: mod.links.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      addedBy: link.addedBy.username,
    })),
    author: {
      discordId: mod.author.discordId,
      username: mod.author.username,
      avatarUrl: mod.author.avatarUrl,
    },
    createdAt: mod.createdAt.toISOString(),
    updatedAt: mod.updatedAt.toISOString(),
  };
}
