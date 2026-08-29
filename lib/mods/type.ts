import type { ModType as UiModType } from "@/lib/mock-data";
import type { ModType as DbModType } from "@/lib/generated/prisma/enums";

// Le cahier des charges (§4) fixe le vocabulaire du modèle de données à car/track,
// alors que l'interface parle de « véhicule » / « circuit ». La conversion vit ici,
// et nulle part ailleurs : l'API expose les valeurs de l'enum Prisma (CAR / TRACK).
export const MOD_TYPES = ["CAR", "TRACK"] as const satisfies readonly DbModType[];

/**
 * Les mêmes valeurs côté interface. Sert à afficher le sélecteur de type du formulaire
 * et à relire une saisie mise de côté (lib/mods/draft.ts).
 */
export const MOD_TYPES_UI = ["vehicule", "circuit"] as const satisfies readonly UiModType[];

const UI_BY_DB: Record<DbModType, UiModType> = {
  CAR: "vehicule",
  TRACK: "circuit",
};

const DB_BY_UI: Record<UiModType, DbModType> = {
  vehicule: "CAR",
  circuit: "TRACK",
};

export function toUiModType(type: DbModType): UiModType {
  return UI_BY_DB[type];
}

export function toDbModType(type: UiModType): DbModType {
  return DB_BY_UI[type];
}
