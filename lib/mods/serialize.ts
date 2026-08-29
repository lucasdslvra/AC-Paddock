import type { ModModel, UserModel } from "@/lib/generated/prisma/models";

/** Forme d'un mod telle qu'exposée par l'API (dates sérialisées en ISO). */
export interface ApiMod {
  id: string;
  type: ModModel["type"];
  name: string;
  url: string;
  description: string | null;
  imageUrl: string | null;
  author: { discordId: string; username: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export function serializeMod(mod: ModModel & { author: UserModel }): ApiMod {
  return {
    id: mod.id,
    type: mod.type,
    name: mod.name,
    url: mod.url,
    description: mod.description,
    imageUrl: mod.imageUrl,
    author: {
      discordId: mod.author.discordId,
      username: mod.author.username,
      avatarUrl: mod.author.avatarUrl,
    },
    createdAt: mod.createdAt.toISOString(),
    updatedAt: mod.updatedAt.toISOString(),
  };
}
