import type {
  SoireeModel,
  SoireeModModel,
  SoireeModOrderByWithRelationInput,
  UserModel,
} from "@/lib/generated/prisma/models";
import { modInclude, serializeMod, type ApiMod, type ModWithRelations } from "@/lib/mods/serialize";
import type { CurrentSoiree } from "./current";

/**
 * Relations à charger avec une soirée pour la sérialiser — même rôle que `modInclude`
 * pour les fiches : une seule construction, partagée par la route API et par la page.
 *
 * `current` n'est pas la soirée qu'on lit : c'est la soirée **en cours**, transmise
 * telle quelle à `modInclude`. `ApiMod.engagement` garde ainsi partout le même sens —
 * « cette fiche est-elle votable en ce moment ? » — y compris quand on affiche une
 * soirée passée, où la réponse doit être non.
 *
 * Le classement (US-G4) est fait par la base : trier côté serveur redonnerait le même
 * ordre, mais après avoir tout chargé.
 */
/**
 * Le classement (US-G4). Typé à part parce qu'un littéral figé par `as const` donne un
 * tableau en lecture seule, que Prisma refuse — même raison que `MOD_ORDER_BY`.
 *
 * Les ex æquo — le cas courant en début de soirée, tout le monde à zéro — se départagent
 * par ordre d'engagement, sans quoi la liste changerait d'ordre à chaque rechargement.
 */
const RANKING_ORDER: SoireeModOrderByWithRelationInput[] = [
  { votes: { _count: "desc" } },
  { createdAt: "asc" },
];

export function soireeInclude(viewerDiscordId: string, current: CurrentSoiree | null) {
  return {
    createdBy: true,
    mods: {
      include: {
        engagedBy: true,
        mod: { include: modInclude(viewerDiscordId, current) },
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
  /** Les mods engagés, déjà classés par votes décroissants. */
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
