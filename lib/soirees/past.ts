import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfToday } from "./current";
import { NO_GUILD } from "./scope";
import { pastSoireeInclude, serializePastSoiree, type ApiPastSoiree } from "./serialize";
import { countVotersBySoiree } from "./vote";

/**
 * US-I1 — les soirées déjà jouées, de la plus récente à la plus ancienne.
 *
 * La borne est celle de `currentSoiree`, et c'est la seule qui tienne : une soirée est
 * passée quand elle n'est plus « en cours », pas quand son heure exacte est dépassée.
 * Prise à l'instant présent, la soirée de ce soir basculerait dans l'archive à 21 h 01,
 * pendant que le groupe est encore devant.
 *
 * Le contraire n'est pas « tout le reste » : entre la soirée en cours et l'historique,
 * il peut exister des soirées programmées plus loin, qui ne sont ni l'une ni l'autre.
 *
 * L'archive est celle d'un serveur : deux groupes ne se racontent pas la même saison.
 *
 * Partagé par `GET /api/soirees?past=true` et par la page `/historique`, comme
 * `soireeInclude` l'est entre la route d'une soirée et sa page : la page lit Prisma
 * directement, il n'y a donc qu'un seul endroit qui décide de ce qu'est une soirée
 * passée.
 */
export async function listPastSoirees(
  guildId: string | null,
  now?: Date,
): Promise<ApiPastSoiree[]> {
  const soirees = await prisma.soiree.findMany({
    where: { guildId: guildId ?? NO_GUILD, date: { lt: startOfToday(now) } },
    orderBy: { date: "desc" },
    include: pastSoireeInclude,
  });

  // En deux temps, et pas en `include` : le comptage dédoublonne par membre (un votant,
  // pas six votes), ce qu'aucun `_count` ne sait faire.
  const voters = await countVotersBySoiree(soirees.map((soiree) => soiree.id));

  return soirees.map((soiree) => serializePastSoiree(soiree, voters.get(soiree.id) ?? 0));
}
