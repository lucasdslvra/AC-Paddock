import "server-only";
import { prisma } from "@/lib/prisma";
import { authorizedGuildIds } from "./guilds";
import type { ModerationList } from "./moderation";
import type { AdminMemberRow } from "./settings";

/**
 * Combien de membres le panneau affiche. Au-delà, il compte sans lister : la liste sert
 * à voir qui est là et devant quel serveur, pas à tenir un annuaire — et le groupe est
 * une poignée de personnes (cahier §1).
 */
export const ADMIN_MEMBER_LIMIT = 12;

/**
 * Les membres connus de l'application, les admins d'abord, puis les plus récemment vus.
 *
 * « Connus » et non « membres du serveur » : Discord ne dit à personne d'autre qu'au
 * membre lui-même à quels serveurs il appartient, et l'application n'a pas de jeton de
 * bot. Ce que la base sait, c'est ce que chaque connexion a constaté — d'où
 * `User.guildId` / `lastSeenAt`, écrits par `recordMemberLogin`.
 */
export async function listAdminMembers(): Promise<ModerationList<AdminMemberRow>> {
  const [authorized, members, total] = await Promise.all([
    authorizedGuildIds(),
    prisma.user.findMany({
      // `role` est un enum Postgres : il se trie dans l'ordre où il est déclaré
      // (MEMBER, puis ADMIN), donc `desc` remonte les admins. Les jamais-vus passent
      // en dernier plutôt qu'en tête — sans `nulls`, Postgres met les NULL devant en
      // ordre décroissant, et la liste s'ouvrirait sur les lignes les moins parlantes.
      orderBy: [
        { role: "desc" },
        { lastSeenAt: { sort: "desc", nulls: "last" } },
        { createdAt: "asc" },
      ],
      take: ADMIN_MEMBER_LIMIT,
      select: {
        discordId: true,
        username: true,
        avatarUrl: true,
        role: true,
        guildId: true,
        guildName: true,
        lastSeenAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  return {
    rows: members.map((member) => ({
      discordId: member.discordId,
      username: member.username,
      avatarUrl: member.avatarUrl,
      isAdmin: member.role === "ADMIN",
      guildName: member.guildName,
      // Un membre vérifié devant un serveur qui n'ouvre plus l'accès garde sa ligne et
      // ses fiches, mais ne repassera plus la porte : c'est ce que la liste doit
      // montrer, pas masquer.
      isAuthorizedGuild: member.guildId !== null && authorized.has(member.guildId),
      lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    })),
    total,
  };
}
