/**
 * Dedicated refusal codes surfaced to the login screen as `?error=`.
 * Kept in its own module so client components can import it without
 * pulling the server-side NextAuth config into the browser bundle.
 */
export const AUTH_ERROR_CODES = {
  /** Authenticated with Discord, but not a member of the configured guild. */
  notGuildMember: "not_guild_member",
  /** Membership could not be verified (missing token, Discord API unreachable). */
  checkFailed: "guild_check_failed",
} as const;
