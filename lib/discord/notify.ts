import "server-only";
import { guildWebhookUrl } from "@/lib/admin/guilds";
import type { ModType } from "@/lib/generated/prisma/enums";
import { formatSoireeCountdown, formatSoireeDate } from "@/lib/soirees/format";
import {
  DISCORD_CANCEL_COLOR,
  DISCORD_EMBED_COLOR,
  postDiscordWebhook,
  type DiscordEmbed,
} from "./webhook";

/**
 * US-L1/L2 — ce que l'application raconte dans le salon Discord.
 *
 * Trois annonces : une soirée programmée et une soirée annulée (US-L1), un mod proposé
 * (US-L2). Le cahier §1 en donne la raison — le groupe vivait sur des liens éparpillés
 * dans Discord, et l'application les a rapatriés ; la notification est le chemin de
 * retour, pour que le salon reste l'endroit où l'on apprend qu'il se passe quelque
 * chose, sans redevenir celui où l'on en discute.
 *
 * Chaque annonce vise **un** serveur, jamais tous : le salon d'un groupe n'est pas
 * ouvert à l'autre, et `guildWebhookUrl` est seul à savoir lequel — voir
 * `lib/admin/guilds.ts`.
 *
 * Les deux fonctions ci-dessous **ne lèvent jamais** et sont faites pour être appelées
 * dans un `after()` : l'écriture est déjà faite et déjà répondue quand elles partent.
 * Rien de ce qui suit ne doit pouvoir faire échouer une création.
 */

/** Le mot de l'interface pour chaque type, au singulier (cahier §4 : car/track). */
const TYPE_LABELS: Record<ModType, string> = { CAR: "Véhicule", TRACK: "Circuit" };

/**
 * Bornes de Discord sur un embed. Un message qui les dépasse est refusé en entier :
 * mieux vaut une description coupée qu'une annonce perdue.
 */
const TITLE_MAX = 256;
const DESCRIPTION_MAX = 700;
const FIELD_MAX = 1024;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * L'adresse publique de l'application, déduite de la requête en cours.
 *
 * Pas de variable d'environnement de plus : le seul usage est de fabriquer un lien
 * cliquable dans le message, et l'hôte par lequel la requête vient d'entrer est
 * justement celui que le membre a sous les yeux. `null` si l'URL est illisible — le
 * message part alors sans lien plutôt que pas du tout.
 */
export function requestOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

/** `null` quand on ne sait pas où pointe l'application : l'embed omet alors son lien. */
function link(origin: string | null, path: string): string | undefined {
  return origin ? `${origin}${path}` : undefined;
}

/**
 * Envoie dans le salon de ce serveur-là, s'il en a un et si ses annonces sont ouvertes.
 *
 * Le salon est résolu **au moment de l'envoi**, pas à la création : couper les annonces
 * d'un serveur ne rattrape pas ce qui est déjà parti, mais rien de ce qui est encore en
 * vol ne passe outre.
 */
async function notify(guildId: string | null, embed: DiscordEmbed): Promise<void> {
  const url = await guildWebhookUrl(guildId);
  if (!url) return;

  await postDiscordWebhook(url, { embeds: [embed] });
}

/** Une soirée, réduite à ce que l'annonce en dit. */
export interface SoireeNotification {
  id: string;
  /** Le serveur à qui elle appartient — c'est son salon qui est prévenu, lui seul. */
  guildId: string;
  /** Le thème, facultatif (cahier §2.5). */
  name: string | null;
  date: Date;
  /** Le pseudo Discord de l'admin qui l'a créée. */
  createdBy: string;
  /** L'adresse de l'application, pour le lien — voir `requestOrigin`. */
  origin: string | null;
}

/**
 * US-L1 — « une nouvelle soirée est programmée ».
 *
 * L'annonce porte la date **et** le compte à rebours : « vendredi 4 septembre 21:00 »
 * dit quand, « dans 3 jours » dit s'il reste le temps de proposer quelque chose, et
 * c'est cette seconde question qui fait cliquer.
 */
export async function notifySoireeCreated(soiree: SoireeNotification): Promise<void> {
  const when = formatSoireeDate(soiree.date);

  await notify(soiree.guildId, {
    title: truncate(soiree.name ? `Nouvelle soirée : ${soiree.name}` : "Nouvelle soirée", TITLE_MAX),
    url: link(soiree.origin, `/soiree/${soiree.id}`),
    color: DISCORD_EMBED_COLOR,
    description: truncate(
      `**${when}** · ${formatSoireeCountdown(soiree.date)}\nProgrammée par ${soiree.createdBy}.`,
      DESCRIPTION_MAX,
    ),
    footer: { text: "Engage tes mods et vote avant le départ." },
    timestamp: soiree.date.toISOString(),
  });
}

/** Une soirée annulée, réduite à ce que l'annonce en dit. */
export interface SoireeCancelledNotification {
  guildId: string;
  name: string | null;
  date: Date;
  /** Le pseudo de l'admin qui l'a annulée. */
  cancelledBy: string;
  /** Engagements et votes emportés avec elle — comptés avant la suppression. */
  modCount: number;
  voteCount: number;
}

/**
 * US-L1 — « la soirée n'aura pas lieu ».
 *
 * L'annonce de création dit à quoi se préparer ; celle-ci défait la même chose, et elle
 * est plus urgente : quelqu'un a peut-être déjà bloqué sa soirée. Elle n'a pas de lien,
 * contrairement aux deux autres — la page a disparu avec la soirée, et un titre
 * cliquable qui mène à un 404 est pire que pas de lien.
 *
 * Ce que la soirée emportait est dit franchement : les engagements et les votes partent
 * avec elle (`onDelete: Cascade`), et quelqu'un qui a voté doit l'apprendre ici plutôt
 * que de le découvrir en rouvrant une page vide. Les fiches, elles, restent au
 * catalogue — c'est tout l'objet de la séparation entre `Mod` et `SoireeMod`, et le pied
 * du message le rappelle.
 */
export async function notifySoireeCancelled(soiree: SoireeCancelledNotification): Promise<void> {
  const emporte = [
    `${soiree.modCount} mod${soiree.modCount > 1 ? "s" : ""} engagé${soiree.modCount > 1 ? "s" : ""}`,
    `${soiree.voteCount} vote${soiree.voteCount > 1 ? "s" : ""}`,
  ].join(" · ");

  await notify(soiree.guildId, {
    title: truncate(soiree.name ? `Soirée annulée : ${soiree.name}` : "Soirée annulée", TITLE_MAX),
    color: DISCORD_CANCEL_COLOR,
    description: truncate(
      `**${formatSoireeDate(soiree.date)}** n'aura pas lieu.\nAnnulée par ${soiree.cancelledBy}.`,
      DESCRIPTION_MAX,
    ),
    fields: [{ name: "Emportés avec elle", value: truncate(emporte, FIELD_MAX), inline: false }],
    footer: { text: "Les fiches restent au catalogue." },
    timestamp: new Date().toISOString(),
  });
}

/** Un mod, réduit à ce que l'annonce en dit. */
export interface ModNotification {
  id: string;
  /**
   * Le serveur par lequel l'auteur est entré, dont le salon est prévenu.
   *
   * Le catalogue, lui, reste commun : un autre groupe verra la fiche sans avoir été
   * notifié. C'est voulu — il est prévenu de ce que *les siens* proposent, pas des
   * fiches de gens qu'il ne croisera jamais en soirée. `null` quand l'application ne
   * sait pas d'où vient l'auteur : personne n'est alors prévenu.
   */
  guildId: string | null;
  name: string;
  type: ModType;
  /** Le lien externe de la fiche (cahier §2.2) — la source du mod, pas notre page. */
  url: string;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
  /** Le pseudo Discord de celui qui l'a proposé. */
  author: string;
  /** US-G2 — la soirée où la fiche a été engagée dans la foulée, s'il y en a une. */
  engagedIn: { name: string | null; date: Date } | null;
  /** L'adresse de l'application, pour le lien — voir `requestOrigin`. */
  origin: string | null;
}

/**
 * US-L2 — « un nouveau mod est proposé ».
 *
 * Le titre mène à la **fiche**, pas au lien externe : c'est là qu'on vote, qu'on
 * complète et qu'on voit si quelqu'un l'a déjà proposé. Le lien d'origine est donné à
 * part, dans un champ — il reste utile, mais il n'est pas la destination.
 */
export async function notifyModCreated(mod: ModNotification): Promise<void> {
  const fields: NonNullable<DiscordEmbed["fields"]> = [
    { name: "Type", value: TYPE_LABELS[mod.type], inline: true },
    { name: "Proposé par", value: truncate(mod.author, FIELD_MAX), inline: true },
  ];

  if (mod.tags.length > 0) {
    fields.push({ name: "Tags", value: truncate(mod.tags.join(" · "), FIELD_MAX), inline: false });
  }

  // US-G2 — engagé à la création : c'est l'information la plus périssable de l'annonce,
  // puisqu'elle dit qu'on peut voter dessus dès maintenant.
  if (mod.engagedIn) {
    const label = mod.engagedIn.name
      ? `${mod.engagedIn.name} — ${formatSoireeDate(mod.engagedIn.date)}`
      : formatSoireeDate(mod.engagedIn.date);
    fields.push({ name: "Engagé pour la soirée", value: truncate(label, FIELD_MAX), inline: false });
  }

  fields.push({ name: "Lien du mod", value: truncate(mod.url, FIELD_MAX), inline: false });

  await notify(mod.guildId, {
    title: truncate(mod.name, TITLE_MAX),
    url: link(mod.origin, `/mods/${mod.id}`),
    color: DISCORD_EMBED_COLOR,
    description: mod.description ? truncate(mod.description, DESCRIPTION_MAX) : undefined,
    fields,
    // L'aperçu de la fiche (US-B2) quand il y en a un : le bucket est public, Discord
    // sait donc l'aller chercher.
    thumbnail: mod.imageUrl ? { url: mod.imageUrl } : undefined,
    footer: { text: "Nouveau mod au catalogue" },
    timestamp: new Date().toISOString(),
  });
}
