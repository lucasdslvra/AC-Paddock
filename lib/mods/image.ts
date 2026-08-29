// Contraintes de l'image d'aperçu (US-B2). Partagées client/serveur : le formulaire
// s'en sert pour refuser un fichier avant de l'envoyer, la route pour valider vraiment.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_LABEL = "5 Mo";

/**
 * Types acceptés en entrée : JPG et PNG uniquement. Tout est ré-encodé en WebP
 * avant stockage. `image/jpg` n'est pas un type MIME officiel — les navigateurs
 * envoient `image/jpeg` — mais certains clients le produisent, on le tolère.
 */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png"] as const;

/** Ce que le sélecteur de fichiers doit proposer (inutile d'y mettre image/jpg). */
export const IMAGE_ACCEPT_ATTRIBUTE = "image/jpeg,image/png";

export function describeImageProblem(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Format non accepté : utilise une image JPG ou PNG.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Image trop lourde : ${MAX_IMAGE_LABEL} maximum.`;
  }
  if (file.size === 0) {
    return "Ce fichier est vide.";
  }
  return null;
}
