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

/** L'extension d'un nom de fichier, en minuscules, point compris. `""` s'il n'en a pas. */
export function modFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

/**
 * Les formats acceptés, et le type MIME que chacun doit réellement avoir. Un mod
 * d'Assetto Corsa se distribue en archive — c'est ce que Content Manager sait
 * installer, et le seul format qui ait un sens ici.
 *
 * US-H2 — la table sert des deux côtés de la validation, et c'est pour ça qu'elle
 * associe les deux : le navigateur et la route filtrent sur l'extension avant l'envoi,
 * puis la route compare le type annoncé au type réellement lu dans les octets de
 * l'objet déposé (lib/mods/archive.ts). Un `.zip` qui n'en est pas un se fait prendre
 * là, pas avant : le nom d'un fichier n'engage que celui qui l'a tapé.
 */
export const MOD_FILE_MIME_TYPES = {
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
} as const;

export type ModFileExtension = keyof typeof MOD_FILE_MIME_TYPES;

export const ALLOWED_MOD_FILE_EXTENSIONS = Object.keys(
  MOD_FILE_MIME_TYPES,
) as ModFileExtension[];

/** Ce que le sélecteur de fichiers doit proposer. */
export const MOD_FILE_ACCEPT_ATTRIBUTE = ALLOWED_MOD_FILE_EXTENSIONS.join(",");

/** Vrai si cette extension est une de celles qu'on accepte — et le dit à TypeScript. */
export function isAllowedModFileExtension(extension: string): extension is ModFileExtension {
  return extension in MOD_FILE_MIME_TYPES;
}

/**
 * Le type MIME que ce nom de fichier **promet**, ou `null` si son extension n'est pas
 * des nôtres. C'est la promesse que la route confrontera aux octets réels.
 */
export function announcedModFileMime(filename: string): string | null {
  const extension = modFileExtension(filename);
  return isAllowedModFileExtension(extension) ? MOD_FILE_MIME_TYPES[extension] : null;
}

/**
 * L'extension qui correspond à un type MIME reconnu — la lecture en sens inverse de la
 * table. Sert au message d'erreur d'US-H2 : dire « c'est une archive .rar » est plus
 * utile à celui qui s'est trompé que « application/vnd.rar ».
 */
export function modFileExtensionForMime(mime: string): ModFileExtension | null {
  const found = ALLOWED_MOD_FILE_EXTENSIONS.find(
    (extension) => MOD_FILE_MIME_TYPES[extension] === mime,
  );
  return found ?? null;
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
  if (!isAllowedModFileExtension(extension)) {
    return `Format non accepté : une archive ${ALLOWED_MOD_FILE_EXTENSIONS.join(", ")} uniquement.`;
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
