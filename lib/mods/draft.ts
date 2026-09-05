import { z } from "zod";
import { MOD_TYPES_UI } from "./type";

// Brouillon du formulaire de création, mis de côté le temps d'aller voir une fiche
// existante (US-D3). La détection de doublons n'a d'intérêt que si consulter la fiche
// suspecte ne coûte rien : sans ça, « Voir la fiche existante » revient à jeter sa
// saisie, et personne ne clique.

/** Une saisie par onglet, effacée à sa fermeture : `sessionStorage`, pas `localStorage`. */
const STORAGE_KEY = "ac-paddock:brouillon-mod";

// Le brouillon a déjà transité par un stockage que rien ne garantit : une version
// précédente du formulaire a pu y écrire une autre forme. On le relit donc comme
// n'importe quelle entrée non fiable, et un brouillon illisible est simplement ignoré.
const modDraftSchema = z.object({
  type: z.enum(MOD_TYPES_UI),
  name: z.string(),
  url: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  /** Image déjà déposée dans le bucket : c'est son URL publique, pas le fichier. */
  imageUrl: z.string().nullable(),
  imageName: z.string().nullable(),
  /**
   * US-G2 — l'interrupteur « engager directement ». Optionnel : un brouillon écrit
   * avant ce champ reste lisible, et retrouve le réglage par défaut du formulaire —
   * décoché, comme à l'ouverture d'un formulaire vierge.
   */
  engage: z.boolean().default(false),
});

export type ModDraft = z.infer<typeof modDraftSchema>;

export function saveModDraft(draft: ModDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Navigation privée, quota, stockage désactivé : au pire la saisie est perdue,
    // ce n'est pas une raison pour empêcher la navigation vers la fiche.
  }
}

/** Le brouillon en attente, ou `null` — y compris pendant le rendu serveur. */
export function readModDraft(): ModDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = modDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearModDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Voir saveModDraft : rien à rattraper ici non plus.
  }
}
