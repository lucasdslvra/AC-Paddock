// US-K3 — le vocabulaire des réglages administrables, partagé client/serveur.
//
// Les bornes vivent ici et nulle part ailleurs : le formulaire de l'espace admin s'en
// sert pour dessiner son curseur, la route pour refuser une valeur hors domaine. Deux
// jeux de bornes finiraient par diverger, et c'est le formulaire qui aurait tort.

/** Clés de la table `AppConfig`. Une valeur absente = la valeur par défaut ci-dessous. */
export const CONFIG_KEYS = {
  /** US-K3 — taille maximale du fichier de mod (le .zip) qu'un membre peut envoyer. */
  maxModFileMo: "mod_file_max_mo",
} as const;

/**
 * Bornes du plafond d'upload, en mégaoctets.
 *
 * Le plancher n'est pas décoratif : au-dessous, plus aucun mod d'Assetto Corsa ne
 * passerait, et le réglage ne servirait qu'à casser l'envoi. Le plafond, lui, est celui
 * qu'on peut tenir — les fichiers ne vivent que 24 h (cahier §2.7), mais ils occupent
 * le stockage pendant ce temps-là, et le lien externe reste la voie recommandée pour
 * les gros mods.
 */
export const MIN_MOD_FILE_MO = 20;
export const MAX_MOD_FILE_MO = 200;
export const DEFAULT_MOD_FILE_MO = 100;

export const MO = 1024 * 1024;

/**
 * Ramène une saisie quelconque à un nombre de mégaoctets valide, ou `null`.
 *
 * `null` plutôt qu'un rabotage silencieux sur la borne la plus proche : une valeur hors
 * domaine vient d'une erreur de saisie, et l'enregistrer « corrigée » ferait croire
 * qu'elle a été acceptée telle quelle.
 */
export function parseModFileMo(input: unknown): number | null {
  const value = typeof input === "string" ? Number(input) : input;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < MIN_MOD_FILE_MO || value > MAX_MOD_FILE_MO) return null;
  return value;
}

/** Les réglages tels que l'API les expose. */
export interface ApiAdminConfig {
  /** US-K3 — plafond d'upload courant, en mégaoctets. */
  maxModFileMo: number;
  /** Quand ce plafond a été posé, en ISO. `null` tant que personne ne l'a changé. */
  maxModFileUpdatedAt: string | null;
  /** Qui l'a posé. `null` si la valeur est celle par défaut, ou l'auteur inconnu. */
  maxModFileUpdatedBy: string | null;
}

/** Une entrée du journal des suppressions (US-K2), telle que l'API l'expose. */
export interface ApiDeletionEntry {
  id: string;
  target: "MOD" | "TAG" | "SOIREE";
  targetId: string;
  label: string;
  detail: string | null;
  asAdmin: boolean;
  actor: string;
  createdAt: string;
}

/** Le mot de l'interface pour chaque cible — le journal ne dit pas « MOD ». */
export const DELETION_TARGET_LABELS: Record<ApiDeletionEntry["target"], string> = {
  MOD: "fiche",
  TAG: "tag",
  SOIREE: "soirée",
};

/** Une ligne du tableau de modération (US-K2). */
export interface AdminModRow {
  id: string;
  name: string;
  author: string;
  /** ISO — c'est l'interface qui décide comment l'écrire. */
  createdAt: string;
  /** Total des votes de la fiche, toutes soirées confondues. */
  votes: number;
  imageUrl: string | null;
  /**
   * US-D2 — nombre d'**autres** fiches qui pointent vers le même lien. Zéro dans
   * l'immense majorité des cas ; au-dessus, c'est le doublon que la création laisse
   * volontairement passer (« Créer quand même », cahier §2.4) et que la modération est
   * là pour trancher.
   */
  duplicates: number;
}

/** Une ligne de la liste des tags de l'espace admin (US-K2). */
export interface AdminTagRow {
  name: string;
  modCount: number;
}

/**
 * Un membre, tel que le panneau « MEMBRES » de l'espace admin l'affiche.
 *
 * Le serveur n'est pas déduit de la configuration courante : c'est celui devant lequel
 * ce membre-là a été vérifié, à sa dernière connexion (`User.guildId`). Il est comparé
 * à la liste des serveurs autorisés — quand elle change, voir qui n'y est plus est
 * justement ce que l'admin a besoin.
 */
export interface AdminMemberRow {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** Le serveur constaté à la dernière connexion. `null` : jamais connecté depuis. */
  guildName: string | null;
  /** Faux si ce serveur ne fait plus partie de ceux qui donnent accès. */
  isAuthorizedGuild: boolean;
  /** Dernière connexion vérifiée, en ISO. `null` si elle est antérieure au suivi. */
  lastSeenAt: string | null;
}

/**
 * Un serveur Discord qui donne accès à l'application (cahier §2.1), tel que le panneau
 * « ACCÈS » l'affiche.
 */
export interface ApiAuthorizedGuild {
  /** L'identifiant de la ligne, ou `null` pour le serveur du déploiement, qui n'en a pas. */
  id: string | null;
  guildId: string;
  /** L'identifiant tronqué : il suffit à vérifier qu'on parle du bon serveur. */
  guildIdMasked: string;
  /** Le nom, quand on le connaît — Discord ne le publie pas à tout le monde. */
  name: string | null;
  /** Protégé contre la suppression. Toujours vrai pour le serveur du déploiement. */
  locked: boolean;
  /** Vrai s'il vient de `DISCORD_GUILD_ID` : ni modifiable ni supprimable d'ici. */
  fromConfig: boolean;
  /** Qui l'a ouvert. `null` pour le serveur du déploiement. */
  addedBy: string | null;
  /** Vrai s'il s'agit du serveur par lequel le membre qui regarde est entré. */
  isViewerGuild: boolean;
}

/** Le panneau « ACCÈS » en entier. */
export interface ApiGuildAccess {
  /** Le serveur du déploiement d'abord, puis les serveurs ajoutés, du plus ancien au plus récent. */
  guilds: ApiAuthorizedGuild[];
  /** `null` si `DISCORD_GUILD_ID` n'est pas renseigné — plus rien ne protège l'accès. */
  configuredGuildId: string | null;
}

const MEMBER_SEEN_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** « 31/08/26 » — la ligne d'un membre est déjà chargée, l'heure n'y ajoute rien. */
export function formatMemberSeenDate(date: Date): string {
  return MEMBER_SEEN_FORMATTER.format(date);
}

const DELETION_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** « 26/08 21:14 » — le journal tient sur une ligne, l'année n'y apporte rien. */
export function formatDeletionDate(date: Date): string {
  return DELETION_DATE_FORMATTER.format(date);
}
