export type ModType = "vehicule" | "circuit";

export interface ModLink {
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
}

export interface Mod {
  id: string;
  type: ModType;
  name: string;
  tags: string[];
  totalVotes: number;
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

export const siteStats = { fiches: 24, votes: 118, soirees: 14 };

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
      { label: "Lien alternatif · ajouté par Tibo", url: "drive.google.com/…/textures", addedBy: "Tibo" },
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

export interface PastSessionPodiumEntry {
  rank: number;
  name: string;
  votes: number;
}

export interface PastSession {
  date: string;
  theme: string;
  podium: PastSessionPodiumEntry[];
  thumbCount: number;
  extraCount: number;
  votants: number;
  membersTotal: number;
  faded?: boolean;
}

export const pastSessions: PastSession[] = [
  {
    date: "22 août",
    theme: "drift night",
    podium: [
      { rank: 1, name: "Nissan Silvia S15 — Rocket Bunny", votes: 8 },
      { rank: 2, name: "Ebisu Minami", votes: 7 },
      { rank: 3, name: "Mazda RX-7 FD3S", votes: 5 },
    ],
    thumbCount: 4,
    extraCount: 5,
    votants: 8,
    membersTotal: 9,
  },
  {
    date: "1er août",
    theme: "endurance 2 h",
    podium: [
      { rank: 1, name: "Nordschleife — Tourist", votes: 9 },
      { rank: 2, name: "Porsche 962C Le Mans", votes: 6 },
      { rank: 3, name: "Nissan Silvia S15 — Rocket Bunny", votes: 5 },
    ],
    thumbCount: 3,
    extraCount: 3,
    votants: 7,
    membersTotal: 9,
  },
  {
    date: "18 juillet",
    theme: "sans thème",
    podium: [
      { rank: 1, name: "Tsukuba Circuit 2020", votes: 6 },
      { rank: 2, name: "Honda Civic EK9", votes: 5 },
      { rank: 3, name: "Toyota AE86 — Spec Touge", votes: 4 },
    ],
    thumbCount: 5,
    extraCount: 7,
    votants: 6,
    membersTotal: 9,
  },
  {
    date: "4 juillet",
    theme: "rallye",
    podium: [
      { rank: 1, name: "Col de Turini", votes: 7 },
      { rank: 2, name: "Lancia Delta S4", votes: 6 },
    ],
    thumbCount: 3,
    extraCount: 0,
    votants: 5,
    membersTotal: 9,
    faded: true,
  },
];

export const pastSessionsOlderCount = 10;

export interface AdminModRow {
  name: string;
  author: string;
  dateLabel: string;
  votes: number;
  danger?: boolean;
  subtitle?: string;
}

export const admin = {
  modsTable: [
    { name: "Nissan Silvia S15 — Rocket Bunny", author: "kev", dateLabel: "19 août", votes: 12 },
    { name: "Ebisu Minami", author: "Tibo", dateLabel: "18 août", votes: 11 },
    {
      name: "Silvia S15 RB (doublon ?)",
      author: "Sam",
      dateLabel: "hier",
      votes: 0,
      danger: true,
      subtitle: "même URL que la fiche #014",
    },
    { name: "Gunsai Touge", author: "lolo_du_74", dateLabel: "12 août", votes: 3 },
  ] satisfies AdminModRow[],
  deletionsLog: [
    "26/08 21:14 · kev · DELETE mod #031 « Silvia S15 RB (doublon) » · 0 vote",
    "24/08 18:02 · kev · DELETE tag « drfit » (faute de frappe) · 2 fiches réassignées",
    "22/08 23:40 · Tibo · DELETE mod #028 « test upload » · auteur",
  ],
  olderLogCount: 11,
  settings: {
    maxUploadMo: 100,
    minUploadMo: 20,
    maxUploadMoCeiling: 200,
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
