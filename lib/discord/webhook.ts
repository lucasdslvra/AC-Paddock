import "server-only";

/**
 * US-L1/L2 — le transport des notifications : un POST sur le webhook Discord d'un
 * salon, et rien d'autre. Ce que les messages racontent est dans `notify.ts`, à quel
 * salon les envoyer dans `lib/admin/guilds.ts` ; ce module ne sait qu'envoyer, échouer
 * en silence, et le dire au journal du serveur.
 *
 * Un webhook est une URL secrète : quiconque l'a peut écrire dans le salon. Elle ne
 * sort jamais du serveur — l'espace admin n'en voit qu'une forme tronquée
 * (`maskWebhookUrl`), jamais la valeur.
 */

/** Un embed Discord, réduit aux champs que nos messages utilisent. */
export interface DiscordEmbed {
  title?: string;
  description?: string;
  /** Le lien du titre — la fiche ou la soirée dans l'application. */
  url?: string;
  /** Couleur de la barre latérale, en entier RVB. */
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
  /** ISO — l'heure affichée au pied de l'embed. */
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

/**
 * L'ambre de l'interface (`--color-amber`), en RVB : le message dans Discord se
 * reconnaît à la même couleur que l'application dont il parle.
 */
export const DISCORD_EMBED_COLOR = 0xf0b544;

/**
 * Le rouge de l'interface (`--color-danger`), pour l'annonce qui défait au lieu
 * d'annoncer : une soirée annulée doit se distinguer d'une soirée programmée dans un
 * salon où les deux se suivent, sans qu'on ait à lire le titre.
 */
export const DISCORD_CANCEL_COLOR = 0xc0392b;

/**
 * Discord n'est pas dans le chemin critique : une notification qui traîne ne doit pas
 * tenir une invocation serverless ouverte jusqu'à son plafond.
 */
const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Un webhook Discord : `https://discord.com/api/webhooks/<id>/<jeton>`. Les sous-domaines
 * `ptb.` et `canary.` sont les préversions de Discord, et `discordapp.com` son ancien
 * domaine, encore servi.
 */
const WEBHOOK_URL_PATTERN =
  /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[\w-]{20,120}$/;

/**
 * L'URL est-elle bien un webhook Discord ?
 *
 * Le contrôle n'est pas cosmétique : sans lui, l'espace admin devient un moyen de faire
 * poster le serveur vers n'importe quelle adresse, avec le contenu des fiches dedans.
 * Un admin est de confiance, mais une confiance n'a pas à être une capacité.
 */
export function isDiscordWebhookUrl(value: string): boolean {
  return WEBHOOK_URL_PATTERN.test(value);
}

/**
 * Le seul reproche qu'on puisse faire à une URL de webhook — elle n'est pas de Discord —
 * dit une fois, pour les deux routes qui en acceptent une.
 */
export const WEBHOOK_URL_ERROR =
  "Colle l'URL donnée par Discord : salon → Intégrations → Webhooks → Copier l'URL.";

/**
 * Le webhook du serveur du déploiement, celui de `DISCORD_GUILD_ID`. Il reste dans
 * l'environnement, comme l'identifiant du serveur auquel il répond : ce serveur n'a pas
 * de ligne en base, et c'est justement ce qui le rend impossible à retirer d'un clic.
 */
export function configuredWebhookUrl(): string | null {
  return process.env.DISCORD_WEBHOOK_URL?.trim() || null;
}

/**
 * « discord.com/…/1403926…/•••• » — de quoi vérifier qu'un webhook est renseigné, et
 * lequel, sans le rendre recopiable. Le jeton est la moitié secrète de l'URL : il ne
 * quitte pas le serveur, y compris vers l'écran d'un admin.
 */
export function maskWebhookUrl(url: string): string {
  const match = url.match(/\/api\/webhooks\/(\d+)\//);
  if (!match) return "webhook · ••••";

  const id = match[1];
  const shortId = id.length <= 8 ? id : `${id.slice(0, 6)}…`;
  return `discord.com/…/${shortId}/••••`;
}

/**
 * Envoie un message dans le salon désigné. Ne lève jamais : l'appelant vient de créer
 * une soirée ou une fiche, et cette écriture-là est faite — un salon Discord
 * injoignable, une URL périmée ou un webhook supprimé n'ont pas à ressortir en 500 chez
 * le membre. L'échec reste dans les logs serveur, seul endroit où il puisse être
 * corrigé.
 *
 * Renvoie `true` si Discord a accepté le message, pour les appelants qui veulent le
 * savoir (aucun aujourd'hui) et pour les tests.
 */
export async function postDiscordWebhook(
  url: string,
  payload: DiscordWebhookPayload,
): Promise<boolean> {
  // Le salon est choisi par l'appelant, mais l'adresse est revérifiée ici : c'est le
  // seul endroit par lequel une requête sortante passe, et une ligne modifiée à la main
  // en base ne doit pas plus pouvoir la détourner qu'un formulaire.
  if (!isDiscordWebhookUrl(url)) {
    console.error("Discord webhook", "URL rejetée");
    return false;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        // Rien de ce qui part d'ici ne doit pouvoir mentionner qui que ce soit : le
        // contenu vient de champs saisis par les membres (nom d'un mod, description,
        // tags), et un `@everyone` dans un nom de fiche réveillerait tout le serveur.
        // Le webhook, lui, a le droit de le faire — d'où l'interdiction explicite.
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      // Un webhook est une écriture : rien à mettre en cache, et le cache de `fetch`
      // ne doit pas transformer deux notifications en une.
      cache: "no-store",
    });

    if (!response.ok) {
      // Le corps de l'erreur dit *pourquoi* (webhook inconnu, embed invalide, quota) —
      // c'est ce qu'on veut lire dans les logs, pas seulement un code.
      const detail = await response.text().catch(() => "");
      console.error("Discord webhook", response.status, detail.slice(0, 500));
      return false;
    }

    return true;
  } catch (error) {
    console.error("Discord webhook", error);
    return false;
  }
}
