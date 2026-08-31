interface DiscordGuildWidget {
  name?: string;
}

/**
 * Public, unauthenticated lookup of a guild's display name — the guild passed in, or
 * the configured one by default.
 * Requires "Server Widget" to be enabled in Discord (Server Settings → Widget) —
 * returns null otherwise (or if DISCORD_GUILD_ID isn't set), and callers should
 * fall back to generic copy in that case.
 */
export async function fetchGuildWidgetName(guild?: string): Promise<string | null> {
  const guildId = guild ?? process.env.DISCORD_GUILD_ID;
  if (!guildId) return null;

  try {
    const res = await fetch(`https://discord.com/api/guilds/${guildId}/widget.json`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: DiscordGuildWidget = await res.json();
    return typeof data.name === "string" ? data.name : null;
  } catch {
    return null;
  }
}
