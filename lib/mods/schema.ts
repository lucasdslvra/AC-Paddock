import { z } from "zod";
import { modUrlKey } from "./url";
import {
  MAX_TAGS_PER_MOD,
  normalizeTagList,
  TAG_MAX_LENGTH,
  TAG_MIN_LENGTH,
} from "./tags";
import { MOD_TYPES } from "./type";

// Ce schéma est partagé : le formulaire s'en sert pour la validation côté client,
// la route POST /api/mods pour la validation côté serveur (la seule qui fasse foi).

const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : value);

// « Pas de valeur » s'écrit aussi bien "" que null en JSON : les deux mènent à
// undefined, que `.optional()` accepte. Côté PATCH, c'est la présence de la clé qui
// dit « efface ce champ » — voir buildModUpdateData.
const emptyToUndefined = (value: unknown) => {
  if (value === null) return undefined;
  const value_ = trimmed(value);
  return value_ === "" ? undefined : value_;
};

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
  // US-C1 — plusieurs tags par mod, créés à la volée. `normalizeTagList` ramène chaque
  // saisie à sa forme canonique et fusionne les doublons *avant* la validation : sans
  // ça, `Drift` et `drift` compteraient pour deux dans la limite ci-dessous.
  //
  // Absent du corps de la requête, ce champ vaut `[]` — sauf en PATCH, où `.partial()`
  // court-circuite le preprocess et laisse `undefined`, ce qui veut dire « ne touche
  // pas aux tags » (voir buildModUpdateData pour la même règle sur les autres champs).
  tags: z.preprocess(
    normalizeTagList,
    z
      .array(
        z
          .string()
          .min(TAG_MIN_LENGTH, `Un tag doit faire au moins ${TAG_MIN_LENGTH} caractères.`)
          .max(TAG_MAX_LENGTH, `Un tag ne doit pas dépasser ${TAG_MAX_LENGTH} caractères.`),
      )
      .max(MAX_TAGS_PER_MOD, `Pas plus de ${MAX_TAGS_PER_MOD} tags par fiche.`),
  ),
});

export type ModInput = z.infer<typeof modInputSchema>;

/**
 * Combien de liens secondaires une fiche accepte, en plus du lien principal.
 *
 * La limite n'est pas technique : passé une demi-douzaine d'adresses, la fiche ne dit
 * plus où télécharger le mod — ce qui est précisément ce qu'elle sert à dire.
 */
export const MAX_LINKS_PER_MOD = 6;

export const LINK_LABEL_MAX_LENGTH = 40;

/**
 * Cahier §2.2 — un lien secondaire ajouté sur une fiche existante (miroir, pack de
 * textures, patch). L'intitulé est facultatif : sans lui, la fiche affiche le domaine,
 * qui en dit déjà autant.
 */
export const modLinkSchema = z.object({
  label: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .max(LINK_LABEL_MAX_LENGTH, `L'intitulé ne doit pas dépasser ${LINK_LABEL_MAX_LENGTH} caractères.`)
      .optional(),
  ),
  url: z.preprocess(
    trimmed,
    z
      .string({ error: "Le lien est obligatoire." })
      .min(1, "Le lien est obligatoire.")
      .max(2048, "Ce lien est trop long.")
      // Comme le lien principal : cette adresse finira dans un href sur la fiche.
      .pipe(z.url({ protocol: /^https?$/, error: "Entre un lien valide, en http(s)://" })),
  ),
});

export type ModLinkInput = z.infer<typeof modLinkSchema>;

/** Version partielle, pour PATCH /api/mods/[id] (US-B3). */
export const modPatchSchema = modInputSchema.partial();

/**
 * Champs scalaires modifiables, tels que Prisma les attend. Les tags n'y sont pas :
 * ce sont des lignes `ModTag` à écrire, et il faut d'abord résoudre les noms en ids —
 * une opération asynchrone, que la route compose à part (voir lib/mods/tags-store.ts).
 */
export interface ModUpdateData {
  type?: ModInput["type"];
  name?: string;
  url?: string;
  /** Jamais saisi : dérivé de `url` (US-D2), et donc toujours écrit avec lui. */
  urlKey?: string;
  description?: string | null;
  imageUrl?: string | null;
}

/**
 * Traduit un PATCH en données Prisma. Seules les clés réellement présentes dans le
 * corps de la requête sont modifiées : une clé absente laisse le champ intact, une clé
 * présente mais vide l'efface. D'où le `?? null` sur les champs optionnels — sans lui,
 * `undefined` signifierait « ne touche pas » pour Prisma et on ne pourrait jamais
 * effacer une description.
 */
export function buildModUpdateData(
  payload: Record<string, unknown>,
  values: Partial<ModInput>,
): ModUpdateData {
  return {
    ...("type" in payload && { type: values.type }),
    ...("name" in payload && { name: values.name }),
    // `urlKey` suit `url` : la clé de comparaison des doublons (US-D2) ne doit jamais
    // désigner l'ancien lien. Le schéma a déjà refusé une valeur vide, la garde sur
    // `undefined` n'est là que pour le typage.
    ...("url" in payload &&
      values.url !== undefined && { url: values.url, urlKey: modUrlKey(values.url) }),
    ...("description" in payload && { description: values.description ?? null }),
    ...("imageUrl" in payload && { imageUrl: values.imageUrl ?? null }),
  };
}

/** Erreurs par champ, dans la forme attendue par le formulaire. */
export type ModFieldErrors = Partial<Record<keyof ModInput, string>>;

/**
 * Premier message d'erreur par champ. On parcourt les issues plutôt que d'utiliser
 * `z.flattenError`, pour accepter aussi bien le schéma complet (POST) que sa version
 * partielle (PATCH).
 */
export function toFieldErrors(error: z.ZodError): ModFieldErrors {
  const result: ModFieldErrors = {};
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !(field in result)) {
      result[field as keyof ModInput] = issue.message;
    }
  }
  return result;
}
