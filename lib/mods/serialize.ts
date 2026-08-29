import type { ModModel, ModTagModel, TagModel, UserModel } from "@/lib/generated/prisma/models";

/**
 * Relations à charger avec une fiche pour pouvoir la sérialiser ou l'afficher.
 * Un seul objet partagé par toutes les lectures (routes API et pages) : ajouter une
 * relation ici la rend disponible partout, et `ModWithRelations` ne peut pas se
 * désynchroniser d'un `include` oublié quelque part.
 *
 * Les tags sortent triés par nom : l'ordre de la table d'association n'a aucun sens
 * pour un lecteur, et un ordre stable évite que les pastilles sautent d'une fiche à
 * l'autre après une édition.
 */
export const modInclude = {
  author: true,
  tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
} as const;

/** Une fiche telle que `modInclude` la ramène. */
export type ModWithRelations = ModModel & {
  author: UserModel;
  tags: (ModTagModel & { tag: TagModel })[];
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
    author: {
      discordId: mod.author.discordId,
      username: mod.author.username,
      avatarUrl: mod.author.avatarUrl,
    },
    createdAt: mod.createdAt.toISOString(),
    updatedAt: mod.updatedAt.toISOString(),
  };
}
