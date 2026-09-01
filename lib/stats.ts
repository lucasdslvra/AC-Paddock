import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Les trois compteurs de l'en-tête et de la page d'accueil.
 *
 * `mods` et `soirees` sont ce que l'interface annonce depuis toujours ; le mot
 * « fiches » a disparu des libellés, mais la chose comptée est la même — une ligne
 * `Mod`. `votes` n'est plus affiché nulle part aujourd'hui : il est conservé ici
 * parce que la page de connexion le montre encore, et qu'il ne coûte qu'un `count`.
 */
export interface SiteStats {
  mods: number;
  votes: number;
  soirees: number;
}

/**
 * Trois `count` plutôt qu'une requête agrégée : Postgres les exécute en parallèle
 * dans la même connexion, et chacun tient dans un index. Ni la soirée en cours ni les
 * filtres du catalogue n'entrent en compte — ce sont les totaux.
 *
 * Une seule chose est rapportée à un serveur : les soirées, qui lui appartiennent
 * (`Soiree.guildId`). Les fiches et les votes restent ceux du site entier — le
 * catalogue est commun à tous les serveurs, et la page de connexion compte de toute
 * façon sans savoir qui regarde.
 *
 * Les votes hérités du MVP (`soireeModId` à NULL, voir le schéma) comptent comme les
 * autres : ce sont des votes réellement exprimés.
 */
export async function countSiteStats(guildId?: string | null): Promise<SiteStats> {
  const [mods, votes, soirees] = await Promise.all([
    prisma.mod.count(),
    prisma.vote.count(),
    prisma.soiree.count({ where: guildId ? { guildId } : undefined }),
  ]);

  return { mods, votes, soirees };
}
