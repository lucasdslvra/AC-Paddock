import type { ModModel, ModTagModel, TagModel, UserModel } from "@/lib/generated/prisma/models";

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
export function modInclude(viewerDiscordId: string) {
  return {
    author: true,
    tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
    // US-F2 — le compteur affiché sur chaque carte, agrégé par la base.
    _count: { select: { votes: true } },
    votes: { where: { user: { discordId: viewerDiscordId } }, select: { userId: true } },
  } as const;
}

/** Une fiche telle que `modInclude` la ramène. */
export type ModWithRelations = ModModel & {
  author: UserModel;
  tags: (ModTagModel & { tag: TagModel })[];
  _count: { votes: number };
  /** Le vote du membre connecté, s'il en a un : zéro ou une ligne, jamais plus. */
  votes: { userId: string }[];
};

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
  /** Nombre total de votes, tous membres confondus (US-F2). */
  votes: number;
  /** Vrai si le membre qui a demandé la fiche a voté pour elle (US-F1). */
  hasVoted: boolean;
  author: { discordId: string; username: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export function serializeMod(mod: ModWithRelations): ApiMod {
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
    // `votes` est filtré sur le seul membre connecté (`modInclude`) : sa présence
    // suffit, il n'y a personne d'autre à y chercher.
    hasVoted: mod.votes.length > 0,
    author: {
      discordId: mod.author.discordId,
      username: mod.author.username,
      avatarUrl: mod.author.avatarUrl,
    },
    createdAt: mod.createdAt.toISOString(),
    updatedAt: mod.updatedAt.toISOString(),
  };
}
