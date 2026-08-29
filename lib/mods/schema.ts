import { z } from "zod";
import { MOD_TYPES } from "./type";

// Ce schéma est partagé : le formulaire s'en sert pour la validation côté client,
// la route POST /api/mods pour la validation côté serveur (la seule qui fasse foi).

const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : value);
const emptyToUndefined = (value: unknown) => (trimmed(value) === "" ? undefined : trimmed(value));

export const modInputSchema = z.object({
  type: z.enum(MOD_TYPES, { error: "Choisis un type : véhicule ou circuit." }),
  name: z.preprocess(
    trimmed,
    z
      .string({ error: "Le nom du mod est obligatoire." })
      .min(2, "Le nom doit faire au moins 2 caractères.")
      .max(120, "Le nom ne doit pas dépasser 120 caractères."),
  ),
  url: z.preprocess(
    trimmed,
    z
      .string({ error: "Le lien externe est obligatoire." })
      .min(1, "Le lien externe est obligatoire.")
      .max(2048, "Ce lien est trop long.")
      // `protocol` bloque les schémas exotiques (javascript:, data:…) : cette URL
      // finira dans un href sur la fiche du mod.
      .pipe(z.url({ protocol: /^https?$/, error: "Entre un lien valide, en http(s)://" })),
  ),
  description: z.preprocess(
    emptyToUndefined,
    z.string().max(2000, "La description ne doit pas dépasser 2000 caractères.").optional(),
  ),
  // Renseignée par la route d'upload (US-B2), jamais saisie à la main. Le contrôle
  // « c'est bien une image de notre bucket » se fait côté serveur, où le préfixe
  // Supabase est connu — ce schéma est aussi chargé par le navigateur.
  imageUrl: z.preprocess(
    emptyToUndefined,
    z
      .url({ protocol: /^https?$/, error: "Lien d'image invalide." })
      .max(2048, "Ce lien d'image est trop long.")
      .optional(),
  ),
});

export type ModInput = z.infer<typeof modInputSchema>;

/** Erreurs par champ, dans la forme attendue par le formulaire. */
export type ModFieldErrors = Partial<Record<keyof ModInput, string>>;

export function toFieldErrors(error: z.ZodError<ModInput>): ModFieldErrors {
  const { fieldErrors } = z.flattenError(error);
  const result: ModFieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const [first] = messages ?? [];
    if (first) result[field as keyof ModInput] = first;
  }
  return result;
}
