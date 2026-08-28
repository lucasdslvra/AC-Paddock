import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import "next-auth/jwt";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";

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
    async signIn({ account }) {
      // Returning a string redirects with a dedicated error code and, per Auth.js,
      // short-circuits before any session is created.
      if (!account?.access_token) return `/?error=${AUTH_ERROR_CODES.checkFailed}`;

      const guilds = await fetchUserGuilds(account.access_token);
      if (!guilds) return `/?error=${AUTH_ERROR_CODES.checkFailed}`;

      const isMember = guilds.some((guild) => guild.id === process.env.DISCORD_GUILD_ID);
      return isMember || `/?error=${AUTH_ERROR_CODES.notGuildMember}`;
    },
    async jwt({ token, profile, account }) {
      if (profile) {
        const discordProfile = profile as unknown as DiscordProfile;
        token.discordId = discordProfile.id;
        token.discordUsername = discordProfile.username;
        const { avatar } = discordProfile;
        if (avatar) {
          const extension = avatar.startsWith("a_") ? "gif" : "png";
          token.discordAvatar = `https://cdn.discordapp.com/avatars/${discordProfile.id}/${avatar}.${extension}`;
        } else {
          token.discordAvatar = null;
        }
      }
      if (account?.access_token) {
        const guilds = await fetchUserGuilds(account.access_token);
        const guild = guilds?.find((g) => g.id === process.env.DISCORD_GUILD_ID);
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
