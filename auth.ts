import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import "next-auth/jwt";
import { authorizedGuildIds } from "@/lib/admin/guilds";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";
import { recordMemberLogin } from "@/lib/session-user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    guildName?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
    discordUsername?: string;
    discordAvatar?: string | null;
    guildName?: string;
  }
}

interface DiscordProfile {
  id: string;
  username: string;
  avatar: string | null;
}

/** CDN avatar URL for a Discord profile, or null when the account has none. */
function avatarUrl(profile: DiscordProfile): string | null {
  if (!profile.avatar) return null;
  const extension = profile.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${extension}`;
}

interface DiscordGuild {
  id: string;
  name: string;
}

async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[] | null> {
  try {
    const res = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      authorization: { params: { scope: "identify guilds" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ account, profile }) {
      // Returning a string redirects with a dedicated error code and, per Auth.js,
      // short-circuits before any session is created.
      if (!account?.access_token) return `/?error=${AUTH_ERROR_CODES.checkFailed}`;

      const guilds = await fetchUserGuilds(account.access_token);
      if (!guilds) return `/?error=${AUTH_ERROR_CODES.checkFailed}`;

      // La liste des serveurs qui donnent accès : celui du déploiement, plus ceux
      // ouverts depuis l'espace admin (cahier §2.1). Appartenir à l'un d'eux suffit.
      const authorized = await authorizedGuildIds();
      const guild = guilds.find((g) => authorized.has(g.id));
      if (!guild) return `/?error=${AUTH_ERROR_CODES.notGuildMember}`;

      // L'appartenance vient d'être constatée : c'est le seul moment où on la connaît,
      // et l'espace admin (« MEMBRES ») n'a pas d'autre source. Sans jeton du membre,
      // Discord ne dit à personne d'autre à quels serveurs il appartient.
      if (profile) {
        const discordProfile = profile as unknown as DiscordProfile;
        await recordMemberLogin({
          discordId: discordProfile.id,
          username: discordProfile.username,
          avatarUrl: avatarUrl(discordProfile),
          guildId: guild.id,
          guildName: guild.name,
        });
      }

      return true;
    },
    async jwt({ token, profile, account }) {
      if (profile) {
        const discordProfile = profile as unknown as DiscordProfile;
        token.discordId = discordProfile.id;
        token.discordUsername = discordProfile.username;
        token.discordAvatar = avatarUrl(discordProfile);
      }
      if (account?.access_token) {
        // Le serveur par lequel ce membre est entré — `signIn` a déjà tranché qu'il en
        // a le droit, on ne fait que retenir lequel, pour l'afficher.
        const [guilds, authorized] = await Promise.all([
          fetchUserGuilds(account.access_token),
          authorizedGuildIds(),
        ]);
        const guild = guilds?.find((g) => authorized.has(g.id));
        if (guild) {
          token.guildName = guild.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.discordId as string;
        session.user.name = (token.discordUsername as string) ?? session.user.name;
        session.user.image = (token.discordAvatar as string | null) ?? session.user.image;
      }
      session.guildName = token.guildName;
      return session;
    },
  },
});
