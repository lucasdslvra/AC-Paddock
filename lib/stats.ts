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
 * dans la même connexion, et chacun tient dans un index. Rien n'est filtré — ce sont
 * les totaux du site, pas ceux de la soirée en cours ni des filtres du catalogue.
 *
 * Les votes hérités du MVP (`soireeModId` à NULL, voir le schéma) comptent comme les
 * autres : ce sont des votes réellement exprimés.
 */
export async function countSiteStats(): Promise<SiteStats> {
  const [mods, votes, soirees] = await Promise.all([
    prisma.mod.count(),
    prisma.vote.count(),
    prisma.soiree.count(),
  ]);

  return { mods, votes, soirees };
}
