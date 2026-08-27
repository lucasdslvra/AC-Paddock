import NextAuth, { type DefaultSession } from "next-auth";
import Discord from "next-auth/providers/discord";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
    discordUsername?: string;
    discordAvatar?: string | null;
  }
}

interface DiscordProfile {
  id: string;
  username: string;
  avatar: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
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
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.discordId as string;
        session.user.name = (token.discordUsername as string) ?? session.user.name;
        session.user.image = (token.discordAvatar as string | null) ?? session.user.image;
      }
      return session;
    },
  },
});
