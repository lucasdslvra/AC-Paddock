// Contraintes et affichage du fichier de mod (Epic H). Partagés client/serveur : le
// panneau d'upload s'en sert pour refuser un fichier avant de demander une URL signée,
// la route pour valider vraiment.
//
// Le plafond de taille, lui, n'est pas ici : il est administrable (US-K3,
// lib/admin/settings.ts) et se lit en base. Il traverse ces fonctions en paramètre.

/**
 * Cahier §2.7 — tout fichier déposé saute 24 h après son upload, quelle que soit la
 * date de la soirée. La suppression effective est l'affaire d'US-H3 ; ici la constante
 * ne sert qu'à dire au membre combien de temps il lui reste.
 */
export const MOD_FILE_TTL_HOURS = 24;

/**
 * Extensions acceptées. Un mod d'Assetto Corsa se distribue en archive — c'est ce que
 * Content Manager sait installer, et le seul format qui ait un sens ici.
 *
 * US-H2 durcira la validation (vérification du contenu, pas seulement du nom) ; ce
 * garde-fou-là existe déjà parce qu'une route qui signe une URL d'écriture sans rien
 * regarder ouvrirait le bucket à n'importe quoi.
 */
export const ALLOWED_MOD_FILE_EXTENSIONS = [".zip", ".rar", ".7z"] as const;

/** Ce que le sélecteur de fichiers doit proposer. */
export const MOD_FILE_ACCEPT_ATTRIBUTE = ".zip,.rar,.7z";

/** L'extension d'un nom de fichier, en minuscules, point compris. `""` s'il n'en a pas. */
export function modFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

/**
 * « 84,2 Mo », « 512 Ko ». Base 1024 comme le reste du projet (`MO` d'US-K3) : c'est
 * l'unité dans laquelle le plafond admin est réglé, afficher autrement ferait mentir la
 * comparaison entre les deux nombres.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const ko = bytes / 1024;
  if (ko < 1024) return `${Math.round(ko)} Ko`;
  const mo = ko / 1024;
  // Une décimale jusqu'à 100 Mo, aucune au-delà : « 128,4 Mo » ne dit rien de plus que
  // « 128 Mo » sur un fichier de cette taille.
  return mo < 100 ? `${mo.toFixed(1).replace(".", ",")} Mo` : `${Math.round(mo)} Mo`;
}

/**
 * Ce qui cloche avec ce fichier, ou `null` s'il peut partir. `maxBytes` est le plafond
 * administrable du moment — le client le reçoit avec la page, la route le relit en base
 * au moment de signer : c'est cette seconde lecture qui fait foi.
 */
export function describeModFileProblem(
  file: { name: string; size: number },
  maxBytes: number,
): string | null {
  const extension = modFileExtension(file.name);
  if (!(ALLOWED_MOD_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return `Format non accepté : une archive ${ALLOWED_MOD_FILE_EXTENSIONS.join(", ")}.`;
  }
  if (file.size === 0) {
    return "Ce fichier est vide.";
  }
  if (file.size > maxBytes) {
    return `Fichier trop lourd : ${formatFileSize(maxBytes)} maximum. Passe plutôt par un lien externe.`;
  }
  return null;
}

/**
 * Le nom d'origine du fichier, relu depuis son URL publique.
 *
 * `Mod` ne porte pas de colonne pour lui (cahier §4 : `fileUrl` et `fileUploadedAt`, et
 * rien d'autre) — il est donc conservé dans la clé de l'objet, dernier segment de
 * l'URL, ce qui le rend aussi lisible par le navigateur au téléchargement.
 */
export function modFileNameFromUrl(fileUrl: string): string {
  const segment = fileUrl.split("?")[0].split("/").pop() ?? "";
  try {
    return decodeURIComponent(segment) || "fichier";
  } catch {
    return segment || "fichier";
  }
}

/** Ce qu'il reste à vivre à un fichier déposé (cahier §2.7). */
export interface ModFileLifetime {
  /** « 19 h 42 », « 12 min ». Vide quand le fichier est expiré. */
  expiresInLabel: string;
  /** Part du délai encore devant, en pourcentage — c'est ce que dessine la barre. */
  remainingPercent: number;
  /**
   * Vrai passé les 24 h. Le fichier est alors encore référencé mais ne devrait plus
   * exister : le balayage d'US-H3 ne tourne pas à la seconde près.
   */
  expired: boolean;
}

export function modFileLifetime(uploadedAt: Date, now: Date = new Date()): ModFileLifetime {
  const total = MOD_FILE_TTL_HOURS * 3_600_000;
  const left = uploadedAt.getTime() + total - now.getTime();

  if (left <= 0) {
    return { expiresInLabel: "", remainingPercent: 0, expired: true };
  }

  const minutes = Math.floor(left / 60_000);
  const hours = Math.floor(minutes / 60);

  return {
    // Sous l'heure, les minutes seules : « 0 h 42 » se lit deux fois.
    expiresInLabel: hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes} min`,
    remainingPercent: Math.round((left / total) * 100),
    expired: false,
  };
}
