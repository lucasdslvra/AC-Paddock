import type { Role } from "@/lib/generated/prisma/enums";

export interface Actor {
  id: string;
  role: Role;
}

/**
 * Cahier §2.6 : la suppression d'une fiche est réservée à son auteur ou à un admin,
 * pour qu'une contribution ne puisse pas être effacée par erreur ou par malveillance.
 * L'édition, elle, est ouverte à tous les membres (US-B3).
 */
export function canDeleteMod(actor: Actor | null, mod: { authorId: string }): boolean {
  if (!actor) return false;
  return actor.role === "ADMIN" || actor.id === mod.authorId;
}
