import type { Mod as ModView } from "@/lib/mock-data";
import { formatAge, formatCreatedAt, formatLinkLabel, stripProtocol } from "./format";
import { serializeMod, type ApiMod, type ModWithRelations } from "./serialize";
import { toUiModType } from "./type";

/**
 * Adapte une fiche telle que l'API la renvoie à la forme consommée par l'interface
 * (celle décrite dans lib/mock-data.ts). C'est par ici que passe le catalogue (US-E1),
 * qui reçoit ses fiches en JSON et n'a donc que des dates ISO sous la main.
 *
 * Les champs encore non implémentés — contributions et soirées (Epic G) — restent
 * vides tant que leurs US ne sont pas faites. `voteHistory` en fait partie : il ne
 * décore que les fiches de démonstration, le vote réel (US-F1) n'a pas d'historique
 * jour par jour à en tirer.
 */
export function apiModToView(mod: ApiMod): ModView {
  const createdAt = new Date(mod.createdAt);

  return {
    id: mod.id,
    type: toUiModType(mod.type),
    name: mod.name,
    tags: mod.tags,
    totalVotes: mod.votes,
    hasVoted: mod.hasVoted,
    voteHistory: [],
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
  };
}

/**
 * La même adaptation depuis une ligne `Mod` de la base, pour les pages qui lisent
 * Prisma directement (la fiche détail). Elle repasse par la sérialisation de l'API
 * plutôt que de dupliquer la conversion : une fiche s'affiche pareil, qu'elle vienne
 * d'un `findUnique` ou d'un `fetch`.
 */
export function toModView(mod: ModWithRelations): ModView {
  return apiModToView(serializeMod(mod));
}
