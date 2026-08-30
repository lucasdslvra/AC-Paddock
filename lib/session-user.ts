import type { Session } from "next-auth";
import { prisma } from "./prisma";

/**
 * La ligne `User` du membre connecté, créée à la volée si c'est sa première écriture.
 *
 * La session ne porte que l'identité Discord (cahier §2.1), jamais un `id` de ligne :
 * toute écriture qui pose une clé étrangère vers `User` — une fiche (US-B1), un vote
 * (US-F1) — passe donc d'abord par ici.
 *
 * Le pseudo et l'avatar sont rafraîchis au passage : ils changent côté Discord, et une
 * écriture est le seul moment où on les revoit.
 */
export function upsertSessionUser(user: Session["user"]) {
  return prisma.user.upsert({
    where: { discordId: user.id },
    update: {
      username: user.name ?? undefined,
      avatarUrl: user.image ?? null,
    },
    create: {
      discordId: user.id,
      username: user.name ?? "membre",
      avatarUrl: user.image ?? null,
    },
  });
}
