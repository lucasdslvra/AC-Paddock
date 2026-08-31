import type { ApiModEngagement } from "@/lib/mods/serialize";

export type ModType = "vehicule" | "circuit";

export interface ModLink {
  /**
   * Identifiant de la ligne `ModLink`, pour pouvoir retirer le lien depuis la fiche.
   * Absent sur le lien principal, qui est une colonne de `Mod`, et sur les données de
   * démonstration, qui n'existent pas en base.
   */
  id?: string;
  label: string;
  /** Version affichée du lien, sans protocole. */
  url: string;
  /** Lien absolu réel. Absent sur les données mock, qui n'ont pas de protocole. */
  href?: string;
  addedBy?: string;
}

export interface ModFileUpload {
  filename: string;
  sizeLabel: string;
  uploadedByLabel: string;
  expiresInLabel: string;
  progressPercent: number;
}

export interface ModContribution {
  author: string;
  action: string;
  whenLabel: string;
}

export interface ModPlayedAt {
  sessionLabel: string;
  rank: number;
  votes: number;
  /** Le thème de la soirée (cahier §2.5), quand elle en avait un. */
  theme?: string | null;
  /** Lien vers la soirée. Absent sur les données de démonstration, qui n'ont pas de page. */
  href?: string;
}

export interface Mod {
  id: string;
  type: ModType;
  name: string;
  tags: string[];
  /** Total des votes de la fiche, toutes soirées confondues (US-F2). */
  totalVotes: number;
  /** Vrai si le membre connecté a voté pour cette fiche dans la soirée en cours. */
  hasVoted?: boolean;
  /**
   * US-G3 — l'engagement de la fiche dans la soirée en cours. `null` si elle n'y est
   * pas engagée, `undefined` sur les fiches de démonstration : dans les deux cas elle
   * n'est pas votable, et le bouton le dit.
   */
  engagement?: ApiModEngagement | null;
  voteHistory: number[];
  author: string;
  ageLabel: string;
  createdAtLabel: string;
  /** URL publique de l'image d'aperçu (US-B2), absente sur les fiches de démo. */
  imageUrl?: string;
  description?: string;
  primaryLink?: ModLink;
  altLinks?: ModLink[];
  fileUpload?: ModFileUpload;
  contributions?: ModContribution[];
  playedAt?: ModPlayedAt[];
}

export const mods: Mod[] = [
  {
    id: "silvia-s15-rocket-bunny",
    type: "vehicule",
    name: "Nissan Silvia S15 — Rocket Bunny",
    tags: ["drift", "jdm", "s-body"],
    totalVotes: 12,
    voteHistory: [40, 65, 55, 85, 100, 75, 90],
    author: "kev",
    ageLabel: "2 j",
    createdAtLabel: "19 août 2026",
    description:
      "Kit large Rocket Bunny v2, deux jeux de jantes, physique retravaillée pour le drift. Version 1.4 : le son moteur a été refait, ça n'a plus rien à voir. Attention, il faut aussi le pack de textures séparé sinon les vitres sont noires.",
    primaryLink: { label: "RaceDepartment", url: "racedepartment.com/…/s15-rb" },
    altLinks: [
      { label: "Pack de textures", url: "drive.google.com/…/textures", addedBy: "Tibo" },
    ],
    fileUpload: {
      filename: "silvia_s15_rb_v14.zip",
      sizeLabel: "84,2 Mo",
      uploadedByLabel: "déposé par Tibo il y a 4 h",
      expiresInLabel: "19 h 42",
      progressPercent: 82,
    },
    contributions: [
      { author: "Tibo", action: "a ajouté un lien alternatif (textures)", whenLabel: "il y a 4 h" },
      { author: "lolo_du_74", action: "a complété la description (v1.4)", whenLabel: "hier" },
      { author: "Nono", action: "a ajouté le tag s-body", whenLabel: "il y a 3 j" },
      { author: "kev", action: "a créé la fiche", whenLabel: "19 août" },
    ],
    playedAt: [
      { sessionLabel: "Soirée du 22 août", rank: 1, votes: 8 },
      { sessionLabel: "Soirée du 1er août", rank: 3, votes: 5 },
    ],
  },
  {
    id: "ebisu-minami",
    type: "circuit",
    name: "Ebisu Minami",
    tags: ["drift", "japon"],
    totalVotes: 11,
    voteHistory: [30, 50, 70, 60, 95, 80, 65],
    author: "Tibo",
    ageLabel: "3 j",
    createdAtLabel: "18 août 2026",
  },
  {
    id: "ae86-spec-touge",
    type: "vehicule",
    name: "Toyota AE86 — Spec Touge",
    tags: ["touge", "vintage"],
    totalVotes: 9,
    voteHistory: [55, 35, 75, 45, 60, 85, 50],
    author: "MaxAttack",
    ageLabel: "5 j",
    createdAtLabel: "16 août 2026",
  },
  {
    id: "nordschleife-tourist",
    type: "circuit",
    name: "Nordschleife — Tourist",
    tags: ["endurance"],
    totalVotes: 7,
    voteHistory: [25, 45, 35, 70, 50, 40, 60],
    author: "Nono",
    ageLabel: "6 j",
    createdAtLabel: "15 août 2026",
  },
  {
    id: "rx7-fd3s-time-attack",
    type: "vehicule",
    name: "Mazda RX-7 FD3S — Time Attack",
    tags: ["jdm"],
    totalVotes: 6,
    voteHistory: [40, 30, 55, 35, 45, 65, 40],
    author: "kev",
    ageLabel: "8 j",
    createdAtLabel: "13 août 2026",
  },
  {
    id: "tsukuba-2020",
    type: "circuit",
    name: "Tsukuba Circuit 2020",
    tags: ["time-attack"],
    totalVotes: 4,
    voteHistory: [20, 35, 25, 45, 30, 40, 28],
    author: "lolo_du_74",
    ageLabel: "9 j",
    createdAtLabel: "12 août 2026",
  },
  {
    id: "akina-downhill",
    type: "circuit",
    name: "Akina Downhill (Irohazaka)",
    tags: ["touge", "japon"],
    totalVotes: 6,
    voteHistory: [25, 40, 55, 50, 70, 85, 90],
    author: "kev",
    ageLabel: "4 j",
    createdAtLabel: "17 août 2026",
  },
  {
    id: "rx7-touge-spec",
    type: "vehicule",
    name: "Mazda RX-7 FD3S — Touge Spec",
    tags: ["jdm"],
    totalVotes: 4,
    voteHistory: [15, 30, 25, 45, 35, 50, 60],
    author: "Nono",
    ageLabel: "7 j",
    createdAtLabel: "14 août 2026",
  },
  {
    id: "gunsai-touge",
    type: "circuit",
    name: "Gunsai Touge",
    tags: ["touge"],
    totalVotes: 3,
    voteHistory: [12, 20, 18, 30, 25, 35, 42],
    author: "lolo_du_74",
    ageLabel: "10 j",
    createdAtLabel: "11 août 2026",
  },
  {
    id: "happogahara",
    type: "circuit",
    name: "Happogahara Full Course",
    tags: ["touge"],
    totalVotes: 1,
    voteHistory: [10, 14, 12, 20, 16, 22, 26],
    author: "Tibo",
    ageLabel: "12 j",
    createdAtLabel: "9 août 2026",
  },
  {
    id: "porsche-962c",
    type: "vehicule",
    name: "Porsche 962C Le Mans",
    tags: ["endurance", "vintage"],
    totalVotes: 6,
    voteHistory: [30, 40, 35, 50, 45, 60, 55],
    author: "Sam",
    ageLabel: "18 j",
    createdAtLabel: "3 août 2026",
  },
  {
    id: "honda-civic-ek9",
    type: "vehicule",
    name: "Honda Civic EK9",
    tags: ["jdm"],
    totalVotes: 5,
    voteHistory: [20, 30, 28, 40, 35, 42, 38],
    author: "Riri",
    ageLabel: "22 j",
    createdAtLabel: "30 juillet 2026",
  },
  {
    id: "col-de-turini",
    type: "circuit",
    name: "Col de Turini",
    tags: ["rallye"],
    totalVotes: 7,
    voteHistory: [25, 35, 30, 45, 40, 55, 50],
    author: "kev",
    ageLabel: "30 j",
    createdAtLabel: "22 juillet 2026",
  },
  {
    id: "lancia-delta-s4",
    type: "vehicule",
    name: "Lancia Delta S4",
    tags: ["rallye", "vintage"],
    totalVotes: 6,
    voteHistory: [22, 30, 26, 38, 34, 46, 42],
    author: "Tibo",
    ageLabel: "30 j",
    createdAtLabel: "22 juillet 2026",
  },
];

export function getModById(id: string): Mod | undefined {
  return mods.find((mod) => mod.id === id);
}

export const tags: { name: string; count: number }[] = Array.from(
  mods.reduce((counts, mod) => {
    for (const tag of mod.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  }, new Map<string, number>()),
)
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count);

export interface EngagedMod {
  modId: string;
  engagedBy: string;
  sessionVotes: number;
  voted: boolean;
  note?: string;
}

export const currentSession = {
  dateLabel: "vendredi 4 septembre",
  timeLabel: "21h",
  theme: "touge only",
  createdBy: "kev",
  votingClosesLabel: "20h",
  daysRemainingLabel: "6 j 04 h",
  membersTotal: 9,
  membersVoted: 5,
  engagedMods: [
    { modId: "ae86-spec-touge", engagedBy: "MaxAttack", sessionVotes: 7, voted: true },
    { modId: "akina-downhill", engagedBy: "kev", sessionVotes: 6, voted: true },
    {
      modId: "silvia-s15-rocket-bunny",
      engagedBy: "Tibo",
      sessionVotes: 5,
      voted: false,
      note: "fichier dispo 19 h",
    },
    { modId: "rx7-touge-spec", engagedBy: "Nono", sessionVotes: 4, voted: false },
    { modId: "gunsai-touge", engagedBy: "lolo_du_74", sessionVotes: 3, voted: true },
    { modId: "happogahara", engagedBy: "Tibo", sessionVotes: 1, voted: false },
  ] satisfies EngagedMod[],
  extraEngagedCount: 2,
  nonVotedMembers: ["Nono", "Sam", "Riri", "Kiki"],
  filesToReuploadCount: 3,
};

/**
 * Ce qui reste de maquette dans l'espace admin. Le tableau de modération, le journal
 * des suppressions et le plafond d'upload sont désormais réels (US-K2/K3) et lus en
 * base ; ne subsistent ici que les panneaux dont aucune US ne parle — la rétention des
 * fichiers, dont le cahier §2.7 fixe la durée « simple et fixe », l'accès Discord et la
 * liste des membres.
 */
export const admin = {
  settings: {
    retentionHours: 24,
    lastCleanupLabel: "07:00 · 3 fichiers",
  },
  access: {
    guildName: "Les Briscards",
    guildIdMasked: "8419…2277",
    notifyDiscord: true,
    webhookChannel: "#salon-mods",
  },
  members: [
    { name: "kev", role: "admin" as const },
    { name: "Tibo", role: "membre" as const },
    { name: "lolo_du_74", role: "membre" as const },
    { name: "MaxAttack", role: "membre" as const },
  ],
  extraMembersCount: 5,
};
