import type { Actor } from "@/lib/mods/permissions";

/**
 * Cahier §2.6 : c'est l'admin/organisateur qui crée les soirées. Engager un mod et
 * voter restent ouverts à tous les membres — le cahier §2.5 dit « les membres associent
 * des mods du catalogue à la soirée et votent », sans restriction.
 */
export function canCreateSoiree(actor: Actor | null): boolean {
  return actor?.role === "ADMIN";
}
