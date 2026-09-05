import "server-only";
import { prisma } from "@/lib/prisma";
import { VOTE_CLOSES_BEFORE_MS } from "./phase";
import { NO_GUILD } from "./scope";

/**
 * Le tirage au sort qui départage les ex æquo d'une soirée (`SoireeMod.tieBreak`), fait
 * une fois, à la fermeture du vote.
 *
 * Une soirée retient un nombre fixe de mods (`RETAINED_COUNT`) et les votes tombent
 * souvent à égalité juste à la barre : quatre véhicules à deux voix pour les deux
 * dernières places. Le sort tranche entre ces quatre-là — et entre eux seulement, ceux
 * qui ont moins de voix restent derrière : le classement se fait d'abord sur les voix,
 * le tirage ne départage que des égaux.
 *
 * **À la fermeture, et pas à l'engagement.** Un tirage écrit à l'engagement déciderait
 * du vainqueur d'une égalité avant que le premier vote soit placé ; celui-ci n'existe
 * qu'au moment où les scores sont arrêtés, comme on tire une place au sort une fois le
 * dépouillement fini.
 *
 * **Une fois, et jamais rejoué.** Le vote ferme 30 min avant le départ, et c'est
 * exactement là que s'ouvre le retrait des fichiers retenus (`phase.ts`) : un tirage
 * refait à chaque lecture changerait les mods de la liste pendant que le groupe
 * télécharge. D'où une colonne écrite en base plutôt qu'un tirage à l'affichage — qui
 * ne survivrait ni à un rechargement, ni au passage d'un membre à l'autre, et que la
 * base ne saurait de toute façon pas rejouer pour trier (`RANKING_ORDER`).
 */

/**
 * Où tirer : une soirée désignée, toutes celles d'un serveur, ou les deux à la fois.
 *
 * Les deux formes existent parce que les deux lectures existent — la page d'une soirée
 * en connaît l'identifiant, l'historique et le passé d'une fiche parcourent une saison
 * entière sans savoir d'avance lesquelles n'ont pas encore été tirées. Le type exige
 * l'une ou l'autre : un tirage sans portée toucherait les soirées de tout le monde.
 *
 * Les deux se cumulent volontiers. Un identifiant vient de l'URL, et une lecture ne doit
 * pas écrire chez un autre groupe même pour un geste aussi anodin : les pages passent
 * donc aussi le serveur du membre, exactement comme leur `findUnique` le revérifie.
 */
export type TieBreakScope =
  | { soireeId: string; guildId?: string | null }
  | { soireeId?: string; guildId: string | null };

/**
 * Écrit le tirage manquant des soirées visées dont le **vote est fermé**, et rend le
 * nombre d'engagements tirés.
 *
 * Sans effet dans tous les autres cas : une soirée dont le vote est ouvert n'est pas
 * tirée, une soirée déjà tirée ne l'est pas deux fois. C'est ce qui permet de l'appeler
 * en tête de n'importe quelle lecture de classement sans se demander laquelle est la
 * première.
 *
 * Le hasard est celui de PostgreSQL, une valeur par ligne, dans un seul `UPDATE` : la
 * condition et l'écriture ne peuvent pas se croiser. Deux lectures simultanées juste
 * après la fermeture ne tirent donc pas deux fois — la seconde attend la première sur
 * les lignes verrouillées, puis ne trouve plus de `tieBreak` à `NULL` et n'écrit rien.
 */
export async function drawTieBreaks(scope: TieBreakScope, now: Date = new Date()): Promise<number> {
  // « Le vote est fermé » s'écrit ici comme une borne sur la date de la soirée plutôt
  // que sur l'heure de fermeture, que la base ne calcule pas : le vote ferme
  // `VOTE_CLOSES_BEFORE_MS` avant le départ, donc il est fermé pour toute soirée partant
  // avant `maintenant + 30 min`. La règle reste dans `phase.ts`, seule sa forme change.
  //
  // Passée en chaîne ISO et coulée en `timestamp`, pas en `Date` : `Soiree.date` est un
  // `TIMESTAMP(3)` sans fuseau, écrit en UTC par Prisma, tandis que le pilote sérialise
  // un objet `Date` avec le décalage de la machine — comparer les deux décalerait la
  // borne de l'écart horaire du serveur, deux heures en été. Le `Z` de la chaîne est
  // ignoré par la conversion, qui garde donc l'heure UTC telle quelle.
  const closed = new Date(now.getTime() + VOTE_CLOSES_BEFORE_MS).toISOString();

  // `undefined` — le critère n'est pas donné — devient `NULL` et laisse passer tout le
  // reste ; `null` sur le serveur, lui, est un critère : c'est le membre dont on ignore
  // le serveur, et il ne doit rien faire écrire nulle part (`NO_GUILD`).
  const soireeId = scope.soireeId ?? null;
  const guildId = scope.guildId === undefined ? null : (scope.guildId ?? NO_GUILD);

  return prisma.$executeRaw`
    UPDATE "SoireeMod" AS sm
    SET "tieBreak" = random()
    FROM "Soiree" AS s
    WHERE sm."soireeId" = s."id"
      AND sm."tieBreak" IS NULL
      AND s."date" <= ${closed}::timestamp
      AND (${soireeId}::text IS NULL OR s."id" = ${soireeId})
      AND (${guildId}::text IS NULL OR s."guildId" = ${guildId})
  `;
}
