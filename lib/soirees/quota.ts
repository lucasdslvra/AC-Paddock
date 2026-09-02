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
 * Un mod sans le moindre vote n'est jamais retenu, même quand la soirée compte moins
 * d'engagements que de places : « les 8 véhicules les plus votés » ne veut pas dire
 * « les 8 premiers de la liste ». C'est `isRetained` qui porte cette règle, et elle
 * seule fait foi.
 */
export const RETAINED_COUNT = { CAR: 8, TRACK: 1 } as const satisfies Record<ModType, number>;

/**
 * Un mod est-il retenu, sachant son rang **parmi ceux de son type** (1 = le plus voté)
 * et le nombre de votes qu'il a reçus dans la soirée ?
 *
 * Sur la soirée en cours, la réponse est une projection : ce que le vote donnerait s'il
 * se fermait maintenant. Sur une soirée passée, c'est le résultat.
 */
export function isRetained(type: ModType, rank: number, votes: number): boolean {
  return votes > 0 && rank <= RETAINED_COUNT[type];
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
 * Les ex æquo se départagent par ordre d'engagement, exactement comme `RANKING_ORDER` :
 * deux classements qui trancheraient différemment feraient sauter les lignes d'un
 * rechargement à l'autre. Les dates sont comparées sous leur forme ISO, où l'ordre
 * alphabétique est l'ordre chronologique.
 */
export function rankSection<T>(
  entries: readonly T[],
  type: ModType,
  read: (entry: T) => { type: ModType; votes: number; engagedAt: string },
): Ranked<T>[] {
  return entries
    .map((entry) => ({ entry, ...read(entry) }))
    .filter((row) => row.type === type)
    .sort((a, b) => b.votes - a.votes || a.engagedAt.localeCompare(b.engagedAt))
    .map((row, index) => ({
      entry: row.entry,
      rank: index + 1,
      retained: isRetained(type, index + 1, row.votes),
    }));
}
