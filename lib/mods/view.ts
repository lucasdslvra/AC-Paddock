import type { Mod as ModView } from "@/lib/mock-data";
import { formatAge, formatCreatedAt, formatLinkLabel, stripProtocol } from "./format";
import {
  MOD_VOTE_HISTORY_LENGTH,
  serializeMod,
  type ApiMod,
  type ModWithRelations,
} from "./serialize";
import { toUiModType } from "./type";

/**
 * Adapte une fiche telle que l'API la renvoie à la forme consommée par l'interface
 * (celle décrite dans lib/mock-data.ts). C'est par ici que passe le catalogue (US-E1),
 * qui reçoit ses fiches en JSON et n'a donc que des dates ISO sous la main.
 *
 * Le fil des contributions et les soirées déjà jouées n'en font pas partie : ils ne
 * s'affichent que sur la fiche détail, qui les lit à part (lib/mods/contributions.ts,
 * lib/mods/played.ts) — les charger ici les ferait payer à chaque carte du catalogue.
 * `voteHistory`, lui, est réel : une barre par soirée où la fiche a été engagée (US-G4),
 * et non plus un ornement des fiches de démonstration.
 */
/**
 * Hauteur, en pourcentage, d'une soirée où la fiche était engagée sans recevoir un
 * seul vote. Zéro la rendrait invisible, donc indistinguable d'une soirée où la fiche
 * n'était pas là — or ce n'est pas la même chose.
 */
const EMPTY_SOIREE_BAR = 6;

/**
 * US-G4 — les comptes de votes des dernières soirées, en hauteurs de barres.
 *
 * Chaque fiche est rapportée à son propre maximum, pas à celui du catalogue : les
 * barres racontent l'histoire d'un mod — « il monte », « il retombe » — et pas son rang.
 * Deux cartes côte à côte ne se comparent donc pas barre à barre, ce que leur taille
 * de vignette n'invite de toute façon pas à faire.
 *
 * La série est complétée à gauche jusqu'à sept colonnes pour que toutes les cartes
 * s'alignent. Ce remplissage est à zéro, donc littéralement vide : une fiche engagée
 * deux fois montre deux barres et cinq blancs, ce qui se lit comme peu d'historique.
 */
function toBarHeights(history: number[]): number[] {
  const peak = Math.max(...history, 1);
  const bars = history.map((count) =>
    count === 0 ? EMPTY_SOIREE_BAR : Math.max(EMPTY_SOIREE_BAR, Math.round((count / peak) * 100)),
  );
  const padding = Array.from({ length: Math.max(0, MOD_VOTE_HISTORY_LENGTH - bars.length) }, () => 0);
  return [...padding, ...bars];
}

export function apiModToView(mod: ApiMod): ModView {
  const createdAt = new Date(mod.createdAt);

  return {
    id: mod.id,
    type: toUiModType(mod.type),
    name: mod.name,
    tags: mod.tags,
    totalVotes: mod.votes,
    hasVoted: mod.hasVoted,
    engagement: mod.engagement,
    voteHistory: toBarHeights(mod.voteHistory),
    author: mod.author.username,
    ageLabel: formatAge(createdAt),
    createdAtLabel: formatCreatedAt(createdAt),
    imageUrl: mod.imageUrl ?? undefined,
    description: mod.description ?? undefined,
    primaryLink: {
      label: formatLinkLabel(mod.url),
      url: stripProtocol(mod.url),
      href: mod.url,
    },
    // Un lien sans intitulé se présente sous son domaine : « racedepartment.com » dit
    // déjà où il mène, et laisser la case vide dessinerait une étiquette blanche.
    altLinks: mod.links.map((link) => ({
      id: link.id,
      label: link.label ?? formatLinkLabel(link.url),
      url: stripProtocol(link.url),
      href: link.url,
      addedBy: link.addedBy,
    })),
  };
}

/**
 * La même adaptation depuis une ligne `Mod` de la base, pour les pages qui lisent
 * Prisma directement (la fiche détail). Elle repasse par la sérialisation de l'API
 * plutôt que de dupliquer la conversion : une fiche s'affiche pareil, qu'elle vienne
 * d'un `findUnique` ou d'un `fetch`.
 */
export function toModView(mod: ModWithRelations, currentSoireeId: string | null): ModView {
  return apiModToView(serializeMod(mod, currentSoireeId));
}
