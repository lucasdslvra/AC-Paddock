import { requireAdmin } from "@/lib/admin/guard";
import { isDiscordWebhookUrl, WEBHOOK_URL_ERROR } from "@/lib/discord/webhook";
import type { AuthorizedGuildUpdateInput } from "@/lib/generated/prisma/models";
import { prisma } from "@/lib/prisma";

/**
 * Modifie un serveur autorisé : son verrou (US-K1), son salon d'annonces et
 * l'interrupteur de ce salon (US-L1/L2).
 *
 * Le verrou ne protège rien d'autre que la suppression : un serveur verrouillé donne
 * accès exactement comme les autres. Il existe parce que retirer un serveur déconnecte
 * tout un groupe à sa prochaine connexion, et que ça ne doit pas tenir à un clic.
 *
 * Une clé absente veut dire « n'y touche pas ». `webhookUrl: null` fait exception, et
 * c'est le seul sens qu'il puisse avoir : retirer le salon. Renseigner un webhook, ici,
 * c'est toujours en poser un entier — l'écran n'en lit jamais que la forme tronquée, il
 * n'aurait rien à renvoyer d'autre.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/guilds/[id]">) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const { locked, notify, webhookUrl } = payload as Record<string, unknown>;

  const data: AuthorizedGuildUpdateInput = {};

  if (locked !== undefined) {
    if (typeof locked !== "boolean") {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }
    data.locked = locked;
  }

  if (notify !== undefined) {
    if (typeof notify !== "boolean") {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }
    data.notify = notify;
  }

  if (webhookUrl !== undefined) {
    // `null` ou la chaîne vide : on retire le salon. Le serveur reste autorisé, il
    // n'est simplement plus prévenu de rien.
    const trimmed = typeof webhookUrl === "string" ? webhookUrl.trim() : null;

    if (webhookUrl !== null && typeof webhookUrl !== "string") {
      return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
    }
    if (trimmed && !isDiscordWebhookUrl(trimmed)) {
      return Response.json(
        { error: "Formulaire invalide.", fieldErrors: { webhookUrl: WEBHOOK_URL_ERROR } },
        { status: 400 },
      );
    }

    data.webhookUrl = trimmed || null;
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Aucune modification demandée." }, { status: 400 });
  }

  try {
    const guild = await prisma.authorizedGuild.update({
      where: { id },
      data,
      // Le webhook n'est pas relu : il est entré, il ne ressort pas. L'écran se
      // rafraîchit depuis la page, qui n'en montre que la forme tronquée.
      select: { id: true, locked: true, notify: true },
    });
    return Response.json(guild);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return Response.json({ error: "Ce serveur n'est pas dans la liste." }, { status: 404 });
    }
    console.error(`PATCH /api/admin/guilds/${id}`, error);
    return Response.json({ error: "Ce serveur n'a pas pu être modifié." }, { status: 500 });
  }
}

/**
 * Retire un serveur de la liste : ses membres ne passeront plus la porte à leur
 * prochaine connexion. Rien n'est effacé de ce qu'ils ont écrit — les fiches, les votes
 * et les soirées appartiennent au catalogue, pas au serveur d'où ils venaient.
 *
 * Un serveur verrouillé n'est pas supprimable : il faut lever le verrou d'abord, ce qui
 * fait deux gestes délibérés au lieu d'un clic.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/guilds/[id]">) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  try {
    const guild = await prisma.authorizedGuild.findUnique({
      where: { id },
      select: { id: true, locked: true },
    });

    if (!guild) {
      return Response.json({ error: "Ce serveur n'est pas dans la liste." }, { status: 404 });
    }
    if (guild.locked) {
      return Response.json(
        { error: "Ce serveur est verrouillé : lève le verrou avant de le retirer." },
        { status: 409 },
      );
    }

    // Le serveur du déploiement n'a pas de ligne : il n'est jamais visé ici, et c'est
    // lui qui garantit qu'il restera toujours une porte ouverte. Sans lui, retirer le
    // dernier serveur fermerait l'application à tout le monde, admins compris.
    if (!process.env.DISCORD_GUILD_ID && (await prisma.authorizedGuild.count()) <= 1) {
      return Response.json(
        {
          error:
            "C'est le dernier serveur autorisé, et DISCORD_GUILD_ID n'est pas renseigné : le retirer fermerait l'accès à tout le monde.",
        },
        { status: 409 },
      );
    }

    await prisma.authorizedGuild.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/admin/guilds/${id}`, error);
    return Response.json({ error: "Ce serveur n'a pas pu être retiré." }, { status: 500 });
  }
}
