import "server-only";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sessionGuildId } from "@/lib/session-user";

/**
 * La soirée en cours : la prochaine à venir, celle du jour comprise.
 *
 * Il n'y a pas de colonne « en cours » sur `Soiree`, et c'est délibéré — une colonne à
 * basculer à la main se serait désynchronisée dès la première soirée passée sans que
 * personne n'y touche. L'état se déduit de la date, donc il est toujours juste.
 *
 * Le seuil est le **début du jour**, pas l'instant présent : une soirée reste « en
 * cours » pendant qu'on y joue, sinon le vote se fermerait à l'heure exacte inscrite
 * dans la base, au moment précis où le groupe est devant. Elle bascule dans
 * l'historique le lendemain.
 *
 * Plusieurs soirées à venir peuvent coexister — un organisateur qui planifie deux
 * semaines d'avance. C'est la plus proche qui est en cours ; les autres attendent.
 *
 * Tout cela se dit **par serveur** : chaque groupe a sa soirée en cours, et deux
 * serveurs qui jouent le même soir ne partagent ni classement ni votes.
 */
export function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * La soirée en cours, ou `null` s'il n'y en a aucune de programmée.
 *
 * Sa **date** est renvoyée avec son identifiant, et pas par confort : c'est la borne
 * de l'historique de votes d'une fiche (`modInclude`). « Les 7 dernières soirées où le
 * mod était présent » s'arrête à celle-ci — une soirée programmée plus loin n'a pas
 * encore eu lieu, ses zéros ne veulent rien dire.
 */
export interface CurrentSoiree {
  id: string;
  date: Date;
  /** Le thème, facultatif — affiché partout où la soirée est nommée avant sa page. */
  name: string | null;
}

export async function currentSoiree(
  guildId: string | null,
  now?: Date,
): Promise<CurrentSoiree | null> {
  // Sans serveur connu, aucune soirée ne concerne ce membre. Renvoyer la prochaine
  // toutes soirées confondues lui ferait voter dans le classement d'un autre groupe.
  if (!guildId) return null;

  return prisma.soiree.findFirst({
    where: { guildId, date: { gte: startOfToday(now) } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, name: true },
  });
}

/** Le seul identifiant, pour les routes qui n'ont pas besoin de la date. */
export async function currentSoireeId(guildId: string | null, now?: Date): Promise<string | null> {
  return (await currentSoiree(guildId, now))?.id ?? null;
}

/**
 * Ce qu'il faut savoir du calendrier pour servir une requête : le serveur du membre, et
 * la soirée en cours de ce serveur.
 *
 * Les deux voyagent ensemble parce qu'ils s'utilisent ensemble — `modInclude` borne
 * l'historique d'une fiche aux soirées du serveur, et sa votabilité à la soirée en
 * cours. Les passer séparément à chaque appel finirait par en désaccorder un.
 */
export interface SoireeContext {
  /** `null` quand l'application ne sait pas d'où vient ce membre (voir `sessionGuildId`). */
  guildId: string | null;
  current: CurrentSoiree | null;
}

export async function soireeContext(session: Session | null, now?: Date): Promise<SoireeContext> {
  const guildId = await sessionGuildId(session);
  return { guildId, current: await currentSoiree(guildId, now) };
}
