import { z } from "zod";

// Partagé par le formulaire de création (US-G1) et par POST /api/soirees, qui seul
// fait foi — même partage que `modInputSchema` pour les fiches.

/** Le thème d'une soirée : « touge only », « rallye »… Cahier §2.5, facultatif. */
export const SOIREE_NAME_MAX_LENGTH = 80;

export const soireeInputSchema = z.object({
  // Le serveur Discord auquel la soirée est attribuée (US-G1). Facultatif dans le
  // schéma seulement : absent, la route retombe sur le serveur de l'admin qui crée.
  // C'est elle, et elle seule, qui vérifie que ce serveur donne bien accès — la liste
  // des serveurs autorisés se lit en base, pas dans un schéma partagé avec le
  // navigateur.
  guildId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined),
    z.string().optional(),
  ),
  // Un thème vide et un thème absent sont la même chose : `undefined`, donc pas de
  // thème. Le formulaire envoie "" quand le champ n'a pas été rempli.
  name: z.preprocess(
    (value) => {
      const trimmed = typeof value === "string" ? value.trim() : value;
      return trimmed === "" || trimmed === null ? undefined : trimmed;
    },
    z
      .string()
      .max(SOIREE_NAME_MAX_LENGTH, `Le thème ne doit pas dépasser ${SOIREE_NAME_MAX_LENGTH} caractères.`)
      .optional(),
  ),
  // Le formulaire envoie une date ISO (`<input type="datetime-local">` recomposé côté
  // client). `z.coerce.date()` accepterait aussi bien `"abc"` transformé en Invalid
  // Date : on valide la chaîne d'abord, on convertit ensuite.
  date: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string({ error: "La date de la soirée est obligatoire." })
      .min(1, "La date de la soirée est obligatoire.")
      .refine((value) => !Number.isNaN(Date.parse(value)), "Cette date n'est pas lisible.")
      .transform((value) => new Date(value)),
  ),
});

export type SoireeInput = z.infer<typeof soireeInputSchema>;

/** Erreurs par champ, dans la forme attendue par le formulaire — cf. `toFieldErrors`. */
export type SoireeFieldErrors = Partial<Record<keyof SoireeInput, string>>;

export function toSoireeFieldErrors(error: z.ZodError): SoireeFieldErrors {
  const result: SoireeFieldErrors = {};
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !(field in result)) {
      result[field as keyof SoireeInput] = issue.message;
    }
  }
  return result;
}
