import type {
  SoireeModel,
  SoireeModModel,
  SoireeModOrderByWithRelationInput,
  UserModel,
} from "@/lib/generated/prisma/models";
import { modInclude, serializeMod, type ApiMod, type ModWithRelations } from "@/lib/mods/serialize";
import type { SoireeContext } from "./current";
import { RETAINED_COUNT } from "./quota";

/**
 * Relations à charger avec une soirée pour la sérialiser — même rôle que `modInclude`
 * pour les fiches : une seule construction, partagée par la route API et par la page.
 *
 * `viewer` ne décrit pas la soirée qu'on lit : c'est le serveur du membre et la soirée
 * **en cours** de ce serveur, transmis tels quels à `modInclude`. `ApiMod.engagement`
 * garde ainsi partout le même sens — « cette fiche est-elle votable en ce moment ? » —
 * y compris quand on affiche une soirée passée, où la réponse doit être non.
 *
 * Le classement (US-G4) est fait par la base : trier côté serveur redonnerait le même
 * ordre, mais après avoir tout chargé.
 */
/**
 * Le classement (US-G4). Typé à part parce qu'un littéral figé par `as const` donne un
 * tableau en lecture seule, que Prisma refuse — même raison que `MOD_ORDER_BY`.
 *
 * Les ex æquo se départagent au sort, par le tirage écrit à la fermeture du vote
 * (`SoireeMod.tieBreak`, `drawTieBreaks`) : c'est lui qui décide, à voix égales,
 * lesquels prennent les dernières places retenues. Comme il est en base et non rejoué à
 * l'affichage, l'ordre ne change pas d'une visite à l'autre.
 *
 * `nulls: "last"` porte le temps où il n'a pas encore eu lieu — le vote est ouvert, les
 * scores bougent encore, il n'y a rien à tirer au sort. `createdAt` range alors les ex
 * æquo par ordre d'engagement : un ordre d'attente, le seul qui ne fasse pas sauter les
 * lignes d'un rechargement à l'autre, et qui ne décide de rien. Il ferme aussi le tri
 * après le tirage, pour l'improbable égalité de tirage.
 */
export const RANKING_ORDER: SoireeModOrderByWithRelationInput[] = [
  { votes: { _count: "desc" } },
  { tieBreak: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
];

export function soireeInclude(viewerDiscordId: string, viewer: SoireeContext) {
  return {
    createdBy: true,
    mods: {
      include: {
        engagedBy: true,
        mod: { include: modInclude(viewerDiscordId, viewer) },
        _count: { select: { votes: true } },
        votes: { where: { user: { discordId: viewerDiscordId } }, select: { id: true } },
      },
      orderBy: RANKING_ORDER,
    },
  } as const;
}

/** Une soirée telle que `soireeInclude` la ramène. */
export type SoireeWithRelations = SoireeModel & {
  createdBy: UserModel;
  mods: (SoireeModModel & {
    engagedBy: UserModel;
    mod: ModWithRelations;
    _count: { votes: number };
    /** Le vote du membre connecté sur cet engagement : zéro ou une ligne. */
    votes: { id: string }[];
  })[];
};

/** Un membre, réduit à ce que l'interface en affiche. */
export interface ApiMember {
  discordId: string;
  username: string;
  avatarUrl: string | null;
}

function serializeMember(user: UserModel): ApiMember {
  return { discordId: user.discordId, username: user.username, avatarUrl: user.avatarUrl };
}

/** US-G2 — un mod engagé dans une soirée, avec son score dans cette soirée-là. */
export interface ApiSoireeMod {
  /** L'identifiant de l'engagement — la cible du vote (US-G3), pas celui du mod. */
  id: string;
  mod: ApiMod;
  engagedBy: ApiMember;
  /**
   * Votes reçus **dans cette soirée**. À ne pas confondre avec `mod.votes`, qui est le
   * total de la fiche toutes soirées confondues : les deux sont affichés, à deux
   * endroits qui répondent à deux questions différentes.
   */
  votes: number;
  /** Vrai si le membre qui a demandé la soirée a voté pour ce mod ici. */
  hasVoted: boolean;
  engagedAt: string;
  /**
   * Le tirage qui départage les ex æquo (`SoireeMod.tieBreak`), du plus petit au plus
   * grand — `null` tant que le vote est ouvert, le tirage n'ayant lieu qu'à sa
   * fermeture.
   *
   * Il voyage jusqu'à la page parce que celle-ci reclasse en direct, sur ses propres
   * scores (`rankSection`) : sans lui, les mods à égalité y prendraient un autre ordre
   * que celui de la base, et la liste de retrait ne serait pas celle qu'affiche la
   * barre des retenus.
   */
  tieBreak: number | null;
}

/** US-G4 — une soirée et son classement. */
export interface ApiSoiree {
  id: string;
  /** Le thème, facultatif (cahier §2.5). */
  name: string | null;
  date: string;
  createdBy: ApiMember;
  createdAt: string;
  /** Vrai s'il s'agit de la soirée en cours — celle où l'on vote (`currentSoiree`). */
  isCurrent: boolean;
  /**
   * Les mods engagés, déjà classés par votes décroissants — véhicules et circuits
   * mêlés. Les deux classements du soir se séparent à l'affichage (`rankSection`) :
   * ils n'ont ni le même quota de votes ni le même nombre de places retenues.
   */
  mods: ApiSoireeMod[];
  /** Membres distincts ayant voté dans cette soirée, pour « 5 / 8 ont voté ». */
  voterCount: number;
}

export function serializeSoiree(
  soiree: SoireeWithRelations,
  context: { isCurrent: boolean; voterCount: number; currentSoireeId: string | null },
): ApiSoiree {
  return {
    id: soiree.id,
    name: soiree.name,
    date: soiree.date.toISOString(),
    createdBy: serializeMember(soiree.createdBy),
    createdAt: soiree.createdAt.toISOString(),
    isCurrent: context.isCurrent,
    mods: soiree.mods.map((entry) => ({
      id: entry.id,
      mod: serializeMod(entry.mod, context.currentSoireeId),
      engagedBy: serializeMember(entry.engagedBy),
      votes: entry._count.votes,
      // Filtré sur le seul membre connecté (`soireeInclude`) : sa présence suffit.
      hasVoted: entry.votes.length > 0,
      engagedAt: entry.createdAt.toISOString(),
      tieBreak: entry.tieBreak,
    })),
    voterCount: context.voterCount,
  };
}

/** La forme allégée que renvoie la liste : sans le classement, qui coûte cher. */
export interface ApiSoireeSummary {
  id: string;
  name: string | null;
  date: string;
  createdBy: ApiMember;
  isCurrent: boolean;
  /** Nombre de mods engagés (US-G2). */
  modCount: number;
}

/**
 * Ce qu'une soirée passée montre dans la liste de l'historique : ce qu'elle a retenu,
 * et rien d'autre.
 *
 * L'archive ne se lit plus comme un classement en cours — la question n'est pas « qui
 * mène ? » mais « qu'est-ce qui a été joué ce soir-là ? ». La ligne ne charge donc que
 * les véhicules retenus (`RETAINED_COUNT.CAR`), et le circuit retenu vient à part : un
 * `take` sur le classement mêlé pourrait ne ramener que des voitures, et la soirée
 * s'afficherait sans son circuit — le seul mod dont il n'y en a qu'un.
 *
 * Le reste des engagements se résume en « +N » à partir de `modCount`. Charger le
 * classement complet de chaque soirée pour n'en afficher que le haut coûterait d'autant
 * plus cher que l'archive grossit — et c'est justement le seul endroit qui grossit tout
 * seul.
 *
 * Aucun filtre sur les voix : les places se remplissent jusqu'au quota même sans
 * personne pour voter, le tirage de la fermeture désignant les dernières
 * (`isRetained`). Le `take` sur le classement suffit donc à donner les retenus.
 */
export const pastSoireeInclude = {
  createdBy: true,
  _count: { select: { mods: true } },
  mods: {
    where: { mod: { is: { type: "CAR" } } },
    take: RETAINED_COUNT.CAR,
    orderBy: RANKING_ORDER,
    // Pas de `modInclude` ici : la ligne n'affiche qu'un nom et une vignette. Charger
    // les tags, l'auteur et l'historique de votes de chaque mod de chaque soirée
    // remplirait la page de données que personne ne regarde.
    include: {
      mod: { select: { id: true, name: true, imageUrl: true } },
      _count: { select: { votes: true } },
    },
  },
} as const;

/** Un engagement réduit à ce que l'historique en affiche — un nom, une vignette, un score. */
export type PastSoireeModWithRelations = SoireeModModel & {
  mod: { id: string; name: string; imageUrl: string | null };
  _count: { votes: number };
};

/** Une soirée passée telle que `pastSoireeInclude` la ramène. */
export type PastSoireeWithRelations = SoireeModel & {
  createdBy: UserModel;
  _count: { mods: number };
  /** Les véhicules retenus, du plus voté au moins voté. */
  mods: PastSoireeModWithRelations[];
};

/** Un mod du haut de classement d'une soirée passée. */
export interface ApiPastSoireeMod {
  /** L'identifiant de la **fiche**, pour lier vers elle — l'engagement ne sert plus. */
  modId: string;
  name: string;
  imageUrl: string | null;
  /** Votes reçus dans cette soirée-là. */
  votes: number;
}

/**
 * US-I1 — une soirée passée dans la liste de l'historique : le résumé commun, plus ce
 * que la soirée a retenu et le nombre de votants. Les votes sont clos : ce qui compte
 * n'est plus « qui peut encore voter » mais « qu'est-ce qui est sorti ».
 */
export interface ApiPastSoiree extends ApiSoireeSummary {
  /** Les véhicules retenus, du plus voté au moins voté — au plus `RETAINED_COUNT.CAR`. */
  cars: ApiPastSoireeMod[];
  /**
   * Le circuit retenu — le plus voté, et il n'y en a qu'un (`RETAINED_COUNT.TRACK`).
   * `null` quand la soirée n'a engagé aucun circuit, ou qu'aucun n'a reçu de vote.
   */
  track: ApiPastSoireeMod | null;
  /** Membres distincts ayant voté ce soir-là. */
  voterCount: number;
}

export function serializePastSoiree(
  soiree: PastSoireeWithRelations,
  voterCount: number,
  track: PastSoireeModWithRelations | null,
): ApiPastSoiree {
  const serializeEntry = (entry: PastSoireeModWithRelations): ApiPastSoireeMod => ({
    modId: entry.mod.id,
    name: entry.mod.name,
    imageUrl: entry.mod.imageUrl,
    votes: entry._count.votes,
  });

  return {
    id: soiree.id,
    name: soiree.name,
    date: soiree.date.toISOString(),
    createdBy: serializeMember(soiree.createdBy),
    // Une soirée passée ne peut pas être celle en cours : `currentSoiree` ne regarde
    // que l'avenir. Le champ est là pour que la forme reste celle du résumé.
    isCurrent: false,
    modCount: soiree._count.mods,
    cars: soiree.mods.map(serializeEntry),
    track: track ? serializeEntry(track) : null,
    voterCount,
  };
}
