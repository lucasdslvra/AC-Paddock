import type { Session } from "next-auth";
import { prisma } from "./prisma";

/**
 * La ligne `User` du membre connecté, créée à la volée si c'est sa première écriture.
 *
 * La session ne porte que l'identité Discord (cahier §2.1), jamais un `id` de ligne :
 * toute écriture qui pose une clé étrangère vers `User` — une fiche (US-B1), un vote
 * (US-F1) — passe donc d'abord par ici.
 *
 * Le pseudo et l'avatar sont rafraîchis au passage : ils changent côté Discord, et une
 * écriture est le seul moment où on les revoit.
 */
export function upsertSessionUser(user: Session["user"]) {
  return prisma.user.upsert({
    where: { discordId: user.id },
    update: {
      username: user.name ?? undefined,
      avatarUrl: user.image ?? null,
    },
    create: {
      discordId: user.id,
      username: user.name ?? "membre",
      avatarUrl: user.image ?? null,
    },
  });
}

/**
 * Inscrit une connexion : la ligne `User` du membre, et le serveur Discord devant
 * lequel son appartenance vient d'être vérifiée (cahier §2.1).
 *
 * Appelée depuis le callback `signIn`, pas depuis une écriture : c'est la connexion,
 * et elle seule, qui constate l'appartenance — un vote ou une fiche n'en savent rien.
 * C'est aussi ce qui fait exister dans la liste des membres ceux qui n'ont encore rien
 * publié : jusqu'ici, se connecter ne laissait aucune trace en base.
 *
 * Ne relance pas d'erreur : une connexion valide ne doit pas échouer parce que la base
 * est indisponible. Le membre entre, et sa ligne sera créée à sa première écriture ou
 * à sa prochaine connexion.
 */
export async function recordMemberLogin(member: {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  guildId: string;
  guildName: string;
}): Promise<void> {
  const seen = {
    username: member.username,
    avatarUrl: member.avatarUrl,
    guildId: member.guildId,
    guildName: member.guildName,
    lastSeenAt: new Date(),
  };

  try {
    await prisma.user.upsert({
      where: { discordId: member.discordId },
      update: seen,
      create: { discordId: member.discordId, ...seen },
    });
  } catch (error) {
    console.error("recordMemberLogin", error);
  }
}
