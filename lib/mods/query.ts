// Vocabulaire de la requête catalogue (Epic E), partagé par la route GET /api/mods et
// par le catalogue qui l'interroge. Les deux lisent les mêmes paramètres avec le même
// analyseur : un filtre écrit dans l'URL de la page se retrouve tel quel dans l'appel
// API, et une valeur inconnue retombe des deux côtés sur la même valeur par défaut.

import type { ModType } from "@/lib/generated/prisma/enums";
import type { ApiSoireeSummary } from "@/lib/soirees/serialize";
import type { ApiMod } from "./serialize";
import { parseTagsParam, serializeTagsParam } from "./tags";
import { MOD_TYPES } from "./type";

/**
 * Taille d'une page du catalogue. Multiple de 2 et de 3 : la grille passe de une à
 * trois colonnes selon la largeur, et une dernière rangée complète évite le trou.
 */
export const MODS_PER_PAGE = 24;

/**
 * Au-delà, la recherche ne discrimine plus rien — mais surtout, ça borne ce qui part
 * dans un `ILIKE` : le paramètre vient de l'URL, personne ne le contrôle.
 */
export const MAX_SEARCH_LENGTH = 80;

/** Temps d'inactivité avant d'interroger l'API pendant la frappe (US-E3). */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * US-E4 — cahier §2.3 : « tri par date d'ajout ou par nombre de votes ». Le tri
 * alphabétique s'y ajoute : les deux tris du cahier répondent à « quoi de neuf ? » et
 * « qu'est-ce qui plaît ? », aucun à « où est la fiche que je cherche ? » — la question
 * qu'on se pose quand on connaît déjà le nom du mod et que le catalogue s'allonge.
 *
 * `az` / `za` plutôt que `nom` / `nom-desc` : le sens de lecture est dans le nom du
 * paramètre, qui se retrouve tel quel dans l'URL partagée.
 */
export const MOD_SORTS = ["date", "votes", "az", "za"] as const;
export type ModSort = (typeof MOD_SORTS)[number];

/** La fiche la plus récente en premier : c'est ce que le catalogue montrait déjà. */
export const DEFAULT_MOD_SORT: ModSort = "date";

/** L'état complet du catalogue, tel qu'il tient dans une URL. */
export interface ModQuery {
  /** Tags actifs, combinés en ET (US-C2). */
  tags: string[];
  /** `null` = tous les types (US-E2). */
  type: ModType | null;
  search: string;
  sort: ModSort;
  /** 1-indexée, comme ce qui s'affiche. */
  page: number;
}

/** Le catalogue sans aucun filtre — première page, tri par défaut. */
export const EMPTY_MOD_QUERY: ModQuery = {
  tags: [],
  type: null,
  search: "",
  sort: DEFAULT_MOD_SORT,
  page: 1,
};

/**
 * De quoi `parseModQuery` a besoin. `useSearchParams` renvoie un `URLSearchParams` en
 * lecture seule, dont le type ne se confond pas avec celui de `new URL(...)` : on ne
 * demande donc que les deux méthodes que les deux partagent.
 */
type SearchParamReader = Pick<URLSearchParams, "get" | "getAll">;

function parseType(raw: string | null): ModType | null {
  return MOD_TYPES.find((type) => type === raw) ?? null;
}

function parseSort(raw: string | null): ModSort {
  return MOD_SORTS.find((sort) => sort === raw) ?? DEFAULT_MOD_SORT;
}

function parsePage(raw: string | null): number {
  const page = Number.parseInt(raw ?? "", 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/**
 * Lit une requête catalogue depuis une URL. Tout paramètre absent, mal orthographié ou
 * hors domaine retombe sur sa valeur par défaut : une URL bricolée à la main affiche un
 * catalogue, jamais une erreur.
 *
 * `tags[]` est accepté à côté de `tags` — c'est la notation du backlog, et celle que
 * produisent les clients HTTP qui suffixent les paramètres répétés.
 */
export function parseModQuery(params: SearchParamReader): ModQuery {
  return {
    tags: parseTagsParam([...params.getAll("tags"), ...params.getAll("tags[]")]),
    type: parseType(params.get("type")),
    search: (params.get("search") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    sort: parseSort(params.get("sort")),
    page: parsePage(params.get("page")),
  };
}

/**
 * Réciproque de `parseModQuery`. Seul ce qui s'écarte de la valeur par défaut est
 * écrit : le catalogue sans filtre reste `/catalogue`, et deux états identiques
 * produisent la même URL — donc la même entrée de cache HTTP côté navigateur.
 */
export function modQueryToSearchParams(query: ModQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.tags.length > 0) params.set("tags", serializeTagsParam(query.tags));
  if (query.type) params.set("type", query.type);
  if (query.search) params.set("search", query.search);
  if (query.sort !== DEFAULT_MOD_SORT) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  return params;
}

/**
 * Nombre de fiches par type, pour les compteurs du filtre (US-E2). Comptés en ignorant
 * le type sélectionné, mais en tenant compte de la recherche et des tags : « Circuits ·
 * 0 » doit rester lisible pendant qu'on regarde les véhicules, sinon le filtre annonce
 * des résultats qu'il n'a pas.
 */
export type ModTypeCounts = { all: number } & Record<ModType, number>;

/** Réponse de `GET /api/mods` (US-E1). */
export interface ModListResponse {
  mods: ApiMod[];
  page: number;
  perPage: number;
  /** Fiches correspondant à la requête, tous types confondus ou non selon le filtre. */
  total: number;
  /** Au moins 1, même sans résultat : « page 1 sur 1 » se lit, « page 1 sur 0 » non. */
  pageCount: number;
  counts: ModTypeCounts;
  /**
   * US-G3 — la soirée en cours, ou `null` s'il n'y en a aucune de programmée. Le
   * catalogue en a besoin deux fois : son panneau latéral l'annonce, et c'est elle qui
   * décide si un bouton de vote peut s'allumer. La renvoyer avec la liste évite au
   * catalogue une seconde requête pour une réponse que la première connaissait déjà.
   */
  currentSoiree: ApiSoireeSummary | null;
}
