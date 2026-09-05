import "server-only";
import { after } from "next/server";
import type { ModType } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { deleteModFile, modFileKeyFromUrl } from "@/lib/r2/storage";
import { isVoteOpen } from "./phase";
import { isRetained } from "./quota";
import { RANKING_ORDER } from "./serialize";
import { drawTieBreaks, type TieBreakScope } from "./tie-break";

/**
 * Ce que la fermeture du vote déclenche : le tirage des ex æquo, puis le retrait des
 * fichiers que le classement, désormais figé, ne retient pas.
 *
 * Une soirée retient huit véhicules et un circuit (`RETAINED_COUNT`) ; on en engage
 * souvent le double, et chaque engagement peut porter une archive de plusieurs centaines
 * de mégaoctets (US-H1). Tant que le vote est ouvert, ces fichiers ont tous une raison
 * d'être là — n'importe lequel peut finir dans les huit. À la fermeture, la question est
 * tranchée : la neuvième voiture ne sera pas jouée ce soir, son `.zip` n'a plus personne
 * à servir, et il occuperait le bucket jusqu'à ses 24 h (cahier §2.7) — c'est-à-dire
 * pendant toute la soirée, et bien au-delà.
 *
 * D'où ce second balayage, à côté de celui de l'expiration (lib/mods/expired-files.ts) :
 * l'un retire ce qui a fait son temps, l'autre ce qui n'a plus de soirée à servir. Les
 * deux vident les mêmes colonnes et laissent la fiche intacte — nom, lien, description,
 * tags, votes, historique. Vider le bucket ne retire jamais rien du catalogue.
 */

export interface UnretainedFilesSweepResult {
  /** Fiches dont le fichier n'était réclamé par aucune soirée. */
  dropped: number;
  /** Fichiers effectivement retirés du bucket, et fiches remises à zéro. */
  deleted: number;
  /**
   * Fiches laissées en l'état parce que le retrait a échoué. Elles repasseront au
   * balayage suivant : comme à l'expiration, `fileUrl` n'est vidé qu'après le retrait
   * réussi de l'objet, sinon plus rien ne désignerait ce qui reste dans le bucket.
   */
  failed: number;
}

const NOTHING: UnretainedFilesSweepResult = { dropped: 0, deleted: 0, failed: 0 };

/**
 * Retire du bucket les fichiers qu'aucune soirée ne réclame plus.
 *
 * Un fichier est **réclamé** dès qu'une seule soirée en a l'usage — une fiche peut être
 * engagée dans plusieurs, et perdre chez l'une ne dit rien de l'autre :
 *
 *   · soirée dont le vote est encore ouvert — tout est réclamé. Le classement affiché
 *     n'est qu'une projection (`rankSection`), et le dernier du moment peut passer
 *     devant d'ici la fermeture ;
 *   · soirée dont le vote est fermé mais le tirage pas encore fait — tout est réclamé
 *     aussi. À voix égales, l'ordre lu en base est un ordre d'attente (`RANKING_ORDER`,
 *     `nulls: "last"`), pas un résultat : trancher dessus retirerait le fichier d'un mod
 *     que le tirage allait retenir ;
 *   · soirée fermée et tirée — seuls les retenus (`isRetained`) réclament le leur.
 *
 * Un fichier qu'aucune soirée ne mentionne du tout part avec les autres : le dépôt est
 * réservé aux mods engagés dans la soirée en cours (`uploadDisabledReason`), donc une
 * fiche qui porte un fichier sans engagement a été désengagée depuis, ou sa soirée
 * annulée. Ce fichier ne servira plus jamais.
 *
 * Le classement est relu ici et non recalculé : c'est `RANKING_ORDER`, l'ordre même que
 * lit la page de la soirée, et c'est ce qui garantit que le fichier retiré est bien
 * celui d'une ligne affichée sous la barre des retenus.
 */
export async function sweepUnretainedModFiles(
  now: Date = new Date(),
): Promise<UnretainedFilesSweepResult> {
  const withFile = await prisma.mod.findMany({
    where: { fileUrl: { not: null } },
    select: { id: true, fileUrl: true },
  });
  if (withFile.length === 0) return NOTHING;

  // Toutes les soirées où l'une de ces fiches est engagée, tous serveurs confondus : un
  // fichier est unique, sa réclamation ne l'est pas. Le classement de chacune est lu en
  // entier, engagements sans fichier compris — ce sont eux qui donnent les rangs.
  const soirees = await prisma.soiree.findMany({
    where: { mods: { some: { modId: { in: withFile.map((mod) => mod.id) } } } },
    select: {
      date: true,
      mods: {
        orderBy: RANKING_ORDER,
        // Pas de compte de votes : le classement vient de la base, déjà trié
        // (`RANKING_ORDER`), et c'est le rang seul qui dit la retenue (`isRetained`).
        select: { modId: true, tieBreak: true, mod: { select: { type: true } } },
      },
    },
  });

  const claimed = new Set<string>();

  for (const soiree of soirees) {
    // « Le tirage est fait » se lit sur les lignes, et sur toutes : un mod engagé après
    // la fermeture arrive avec un `tieBreak` nul, et la prochaine lecture le tirera
    // (`drawTieBreaks`). Une soirée à moitié tirée n'a pas de classement arrêté.
    const settled =
      !isVoteOpen(soiree.date, now) && soiree.mods.every((entry) => entry.tieBreak !== null);

    if (!settled) {
      for (const entry of soiree.mods) claimed.add(entry.modId);
      continue;
    }

    // Le rang se compte par type : les deux classements du soir ont chacun leur quota
    // (`RETAINED_COUNT`), et la base les rend mêlés.
    const seen: Record<ModType, number> = { CAR: 0, TRACK: 0 };
    for (const entry of soiree.mods) {
      const type = entry.mod.type;
      seen[type] += 1;
      if (isRetained(type, seen[type])) claimed.add(entry.modId);
    }
  }

  const dropped = withFile.filter((mod) => !claimed.has(mod.id));

  let deleted = 0;
  let failed = 0;

  for (const mod of dropped) {
    const key = mod.fileUrl ? modFileKeyFromUrl(mod.fileUrl) : null;

    try {
      // Même ordre qu'à l'expiration : l'objet part avant que la fiche l'oublie. Une URL
      // étrangère au bucket n'a rien à retirer, et `DeleteObject` réussit sur une clé
      // déjà absente.
      if (key) await deleteModFile(key);

      await prisma.mod.update({
        where: { id: mod.id },
        data: { fileUrl: null, fileUploadedAt: null },
      });
      deleted += 1;
    } catch (error) {
      // Un échec sur une fiche n'interrompt pas le balayage des autres.
      console.error(`Retrait du fichier non retenu du mod ${mod.id}`, error);
      failed += 1;
    }
  }

  return { dropped: dropped.length, deleted, failed };
}

/**
 * Ce que fait une lecture de classement : elle tire les ex æquo des soirées visées, et
 * si elle en a tiré, elle programme le retrait des fichiers non retenus.
 *
 * Remplace l'appel direct à `drawTieBreaks` partout où un classement se lit. Les deux
 * gestes vont ensemble et dans cet ordre : le balayage ne touche qu'aux soirées déjà
 * tirées, c'est donc ce tirage-ci qui lui ouvre la soirée qui vient de fermer.
 *
 * `drawTieBreaks` n'écrit qu'une fois par engagement : son compte est non nul à la
 * **première** lecture qui suit la fermeture, et nul à toutes les suivantes. C'est la
 * bascule qu'on attendait — sans elle, chaque affichage de la soirée irait interroger le
 * bucket pour n'y rien trouver à retirer.
 *
 * `after` parce que ce n'est pas au membre de payer ce ménage : il ouvre la page au
 * moment précis où le retrait s'ouvre (`phase.ts`), et il attendrait une poignée
 * d'appels à Cloudflare avant de voir sa liste. La réponse part, le balayage suit —
 * Vercel garde l'invocation ouverte pour lui, comme pour les annonces Discord.
 *
 * Aucune trace n'est écrite ici, contrairement au balayage de la tâche planifiée : la
 * pastille de l'espace admin dit si le nettoyage horaire tourne encore
 * (`isSweepStale`), et un passage déclenché par une visite la remettrait au vert sans
 * rien prouver.
 */
export async function settleSoirees(scope: TieBreakScope, now?: Date): Promise<void> {
  if ((await drawTieBreaks(scope, now)) > 0) {
    after(() => sweepUnretainedModFiles(now));
  }
}
