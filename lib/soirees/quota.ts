import type { ModType } from "@/lib/generated/prisma/enums";

/**
 * Les deux règles du vote d'une soirée : combien de votes chacun a, et combien de mods
 * la soirée retient à la fin.
 *
 * Une soirée accueille autant de véhicules et de circuits qu'on veut — engager reste
 * sans limite (cahier §2.5 : « les membres associent des mods du catalogue à la soirée
 * et votent »). C'est le **vote** qui est contingenté, et c'est ce qui fait le tri : si
 * chacun pouvait voter pour tout, une liste de trente voitures ressortirait trente fois
 * à égalité, et le classement ne dirait rien de ce que le groupe veut vraiment jouer.
 *
 * Les deux nombres ne sont pas les mêmes de chaque côté, et c'est voulu :
 *
 *   · véhicules — 8 votes par membre, 8 retenus. Une soirée se joue avec une grille de
 *     voitures, pas avec une seule ; chacun compose la sienne, et la grille du soir est
 *     la somme des préférences.
 *   · circuits — 3 votes par membre, 1 retenu. On ne roule que sur un circuit : les
 *     trois votes servent à dire « l'un de ces trois me va », pour qu'un second choix
 *     l'emporte plutôt qu'un premier choix isolé.
 *
 * Des constantes, pas un réglage d'`AppConfig` : ce sont les règles du jeu du groupe,
 * pas un paramètre d'exploitation comme la taille des uploads. Les changer se fait ici,
 * et l'interface comme les routes s'y rangent sans rien à ressaisir ailleurs.
 *
 * Ce fichier est lu des deux côtés — la route qui refuse le neuvième vote et le panneau
 * qui affiche « 6 / 8 » comptent la même chose. Pas de `server-only`, donc, et aucune
 * dépendance à Prisma.
 */
export const VOTE_QUOTA = { CAR: 8, TRACK: 3 } as const satisfies Record<ModType, number>;

/**
 * Combien de mods de chaque type une soirée retient — les plus votés, dans la limite
 * de ce nombre.
 *
 * Les places se remplissent jusqu'au bout, même sans voix. Six véhicules votés et douze
 * autres à zéro : la soirée en retient huit — les six votés, puis deux tirés au sort
 * parmi les douze (`tieBreak`, `drawTieBreaks`). Un soir se joue sur une grille pleine,
 * et laisser deux places vides parce que personne n'a voté pour ces douze-là priverait
 * la soirée de véhicules que rien ne disqualifie.
 *
 * C'est aussi à quoi sert le tirage, et pas seulement à départager le haut du tableau :
 * sans lui, les places restantes iraient aux premiers engagés, et l'ordre d'arrivée
 * déciderait de la grille à la place du groupe.
 */
export const RETAINED_COUNT = { CAR: 8, TRACK: 1 } as const satisfies Record<ModType, number>;

/**
 * Un mod est-il retenu, sachant son rang **parmi ceux de son type** (1 = le plus voté) ?
 *
 * Le rang seul décide, parce qu'il porte déjà tout : les voix d'abord, le tirage de la
 * fermeture ensuite pour les départager (`RANKING_ORDER`, `rankSection`). Un mod sans
 * voix classé septième est donc retenu — il l'est par le sort, tiré parmi tous ceux qui
 * n'ont pas de voix non plus, et non parce qu'il a été engagé avant eux.
 *
 * Sur la soirée en cours, la réponse est une projection : ce que le vote donnerait s'il
 * se fermait maintenant. Le tirage n'a pas encore eu lieu et les mods à égalité s'y
 * rangent par ordre d'engagement, d'où la mention affichée sous la barre — la place se
 * tire au sort à la fermeture (`hasTieAtCut`). Sur une soirée passée, c'est le résultat.
 */
export function isRetained(type: ModType, rank: number): boolean {
  return rank <= RETAINED_COUNT[type];
}

/** « véhicules » / « circuits » — le mot de l'interface, au pluriel des quotas. */
export function modTypePlural(type: ModType): string {
  return type === "CAR" ? "véhicules" : "circuits";
}

/**
 * Le refus opposé au vote de trop (route) et la raison affichée sous un bouton éteint
 * (interface) : la même phrase des deux côtés, pour que le clic et l'explication ne se
 * contredisent pas.
 *
 * Elle dit quoi faire, parce qu'il y a quelque chose à faire : les votes se retirent,
 * un quota atteint n'est pas une porte fermée pour la soirée.
 */
export function quotaReachedMessage(type: ModType): string {
  return `Tes ${VOTE_QUOTA[type]} votes ${modTypePlural(type)} de cette soirée sont déjà placés : retires-en un pour voter ailleurs.`;
}

/** Un engagement classé : son rang parmi ceux de son type, et s'il est retenu. */
export interface Ranked<T> {
  entry: T;
  /** 1 = le plus voté de son type. */
  rank: number;
  /** Voir `isRetained` — projection tant que la soirée est en cours. */
  retained: boolean;
  /**
   * Le score sur lequel ce rang a été calculé — celui que l'interface tient, votes
   * optimistes compris, et non celui de la ligne du serveur. C'est lui qui dit si deux
   * lignes voisines sont à égalité (`hasTieAtCut`).
   */
  votes: number;
}

/**
 * Le classement d'un type dans une soirée : les engagements de ce type, du plus voté au
 * moins voté, chacun avec son rang et sa retenue.
 *
 * La base trie déjà le classement (`RANKING_ORDER`), tous types mêlés — mais elle le
 * trie avec les votes qu'elle connaissait à la lecture. Le membre, lui, vote sans
 * recharger : ses propres votes bougent avant la réponse du serveur, et le classement
 * doit bouger avec eux, sinon la barre des retenus dit le contraire du bouton qu'on
 * vient de cliquer. C'est pourquoi le tri est refait ici, sur les scores tenus par
 * l'interface.
 *
 * Les ex æquo se départagent au sort, exactement comme `RANKING_ORDER` : chaque
 * engagement reçoit son tirage à la fermeture du vote (`SoireeMod.tieBreak`,
 * `drawTieBreaks`), et c'est lui qui décide, à voix égales, lesquels prennent les
 * dernières places retenues. Quatre véhicules à deux voix pour deux places, et deux
 * d'entre eux passent — tirés au sort parmi ces quatre-là seulement : ceux qui ont
 * moins de voix restent derrière, le sort ne départage jamais que des égaux.
 *
 * Le tirage vient de la base et n'est jamais rejoué ici : deux classements qui
 * trancheraient différemment feraient sauter les lignes d'un rechargement à l'autre, et
 * la liste de retrait changerait de mods sous les pieds du groupe. Tant que le vote est
 * ouvert il n'a pas eu lieu (`null`), et les ex æquo se rangent par ordre d'engagement,
 * comme `RANKING_ORDER` avec ses `nulls: "last"` — un ordre d'attente, que le tirage
 * remplacera. `engagedAt` ferme le tri dans les deux cas ; les dates sont comparées
 * sous leur forme ISO, où l'ordre alphabétique est l'ordre chronologique.
 */
export function rankSection<T>(
  entries: readonly T[],
  type: ModType,
  read: (entry: T) => {
    type: ModType;
    votes: number;
    tieBreak: number | null;
    engagedAt: string;
  },
): Ranked<T>[] {
  // Un tirage absent passe derrière tous les autres, comme le `nulls: "last"` de la
  // base : les deux tris doivent lire la même chose, sinon la page et la liste de
  // retrait ne retiennent pas les mêmes mods.
  const drawn = (tieBreak: number | null) => tieBreak ?? Number.POSITIVE_INFINITY;

  return entries
    .map((entry) => ({ entry, ...read(entry) }))
    .filter((row) => row.type === type)
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        drawn(a.tieBreak) - drawn(b.tieBreak) ||
        a.engagedAt.localeCompare(b.engagedAt),
    )
    .map((row, index) => ({
      entry: row.entry,
      rank: index + 1,
      retained: isRetained(type, index + 1),
      votes: row.votes,
    }));
}

/**
 * Y a-t-il une égalité **à la barre** — le dernier retenu et le premier qui ne l'est pas
 * ont-ils le même nombre de voix ?
 *
 * La question ne se pose que pendant que le vote est ouvert : le classement affiché est
 * alors une projection, et ses ex æquo attendent encore le tirage de la fermeture. La
 * page le dit sous la barre, sinon deux mods à égalité s'y liraient comme un classement
 * acquis — l'un retenu, l'autre non, sans que rien n'explique pourquoi.
 *
 * Elle ne regarde que la coupe, et pas les égalités du milieu du tableau : celles-là
 * seront tirées aussi, mais elles ne changent la place de personne.
 */
export function hasTieAtCut<T>(rows: readonly Ranked<T>[]): boolean {
  const cut = rows.findIndex((row) => !row.retained);
  return cut > 0 && rows[cut - 1]!.votes === rows[cut]!.votes;
}
