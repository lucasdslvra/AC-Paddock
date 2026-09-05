import "server-only";
import { prisma } from "@/lib/prisma";
import { settleSoirees } from "./closing";
import { startOfToday } from "./current";
import { NO_GUILD } from "./scope";
import {
  pastSoireeInclude,
  RANKING_ORDER,
  serializePastSoiree,
  type ApiPastSoiree,
  type PastSoireeModWithRelations,
} from "./serialize";
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
  // Le tirage des ex æquo précède la lecture : `pastSoireeInclude` ne ramène que les
  // huit véhicules du haut (`take`), c'est donc le tri de la base qui choisit ce que
  // l'archive montre. Toutes les soirées du serveur d'un coup, et pas seulement celles
  // de la page : leur vote est fermé depuis longtemps, et une soirée que personne n'a
  // ouverte depuis attend encore son tirage.
  await settleSoirees({ guildId }, now);

  const soirees = await prisma.soiree.findMany({
    where: { guildId: guildId ?? NO_GUILD, date: { lt: startOfToday(now) } },
    orderBy: { date: "desc" },
    include: pastSoireeInclude,
  });

  const ids = soirees.map((soiree) => soiree.id);

  // En deux temps, et pas en `include` : le comptage dédoublonne par membre (un votant,
  // pas six votes), ce qu'aucun `_count` ne sait faire. Le circuit retenu se lit à part
  // pour une autre raison — voir `retainedTracks`.
  const [voters, tracks] = await Promise.all([countVotersBySoiree(ids), retainedTracks(ids)]);

  return soirees.map((soiree) =>
    serializePastSoiree(soiree, voters.get(soiree.id) ?? 0, tracks.get(soiree.id) ?? null),
  );
}

/**
 * Le circuit retenu de chaque soirée — le plus voté, et il n'y en a qu'un
 * (`RETAINED_COUNT.TRACK`).
 *
 * Une requête à part de `pastSoireeInclude`, parce que Prisma ne sait pas prendre « les
 * huit premiers véhicules **et** le premier circuit » dans une seule relation : un
 * `take` sur le classement mêlé ramènerait, sur une soirée à vingt voitures, huit
 * voitures et pas de circuit — alors que c'est le seul mod dont il n'y en a qu'un.
 *
 * Une seule requête pour toute la page, tous les circuits de toutes les soirées
 * affichées. C'est bien moins que le classement complet : un soir se joue sur un
 * circuit, on en propose une poignée.
 *
 * Aucun filtre sur les voix : une soirée retient son circuit même quand personne ne l'a
 * voté — le tirage de la fermeture le désigne parmi ceux à égalité (`isRetained`). Le
 * premier du classement est le circuit retenu, avec ou sans voix.
 */
async function retainedTracks(
  soireeIds: string[],
): Promise<Map<string, PastSoireeModWithRelations>> {
  if (soireeIds.length === 0) return new Map();

  const engagements = await prisma.soireeMod.findMany({
    where: { soireeId: { in: soireeIds }, mod: { is: { type: "TRACK" } } },
    orderBy: RANKING_ORDER,
    include: {
      mod: { select: { id: true, name: true, imageUrl: true } },
      _count: { select: { votes: true } },
    },
  });

  // Le tri est global, mais il vaut soirée par soirée : à l'intérieur d'une même soirée,
  // les circuits se présentent dans l'ordre du classement. Le premier vu pour une soirée
  // est donc le sien.
  const retained = new Map<string, PastSoireeModWithRelations>();
  for (const engagement of engagements) {
    if (!retained.has(engagement.soireeId)) retained.set(engagement.soireeId, engagement);
  }
  return retained;
}
