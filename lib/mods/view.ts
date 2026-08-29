import type { Mod as ModView } from "@/lib/mock-data";
import { formatAge, formatCreatedAt, formatLinkLabel, stripProtocol } from "./format";
import type { ModWithRelations } from "./serialize";
import { toUiModType } from "./type";

/**
 * Adapte une ligne `Mod` de la base à la forme consommée par l'interface
 * (celle décrite dans lib/mock-data.ts). Les champs encore non implémentés —
 * votes (Epic F), contributions et soirées (Epic G) — restent vides tant que
 * leurs US ne sont pas faites.
 */
export function toModView(mod: ModWithRelations): ModView {
  return {
    id: mod.id,
    type: toUiModType(mod.type),
    name: mod.name,
    tags: mod.tags.map(({ tag }) => tag.name),
    totalVotes: 0,
    voteHistory: [],
    author: mod.author.username,
    ageLabel: formatAge(mod.createdAt),
    createdAtLabel: formatCreatedAt(mod.createdAt),
    imageUrl: mod.imageUrl ?? undefined,
    description: mod.description ?? undefined,
    primaryLink: {
      label: formatLinkLabel(mod.url),
      url: stripProtocol(mod.url),
      href: mod.url,
    },
  };
}
