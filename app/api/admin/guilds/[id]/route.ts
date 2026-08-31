import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";

/**
 * Lève ou pose le verrou d'un serveur autorisé (US-K1).
 *
 * Le verrou ne protège rien d'autre que la suppression : un serveur verrouillé donne
 * accès exactement comme les autres. Il existe parce que retirer un serveur déconnecte
 * tout un groupe à sa prochaine connexion, et que ça ne doit pas tenir à un clic.
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

  const locked = (payload as { locked?: unknown } | null)?.locked;
  if (typeof locked !== "boolean") {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  try {
    const guild = await prisma.authorizedGuild.update({
      where: { id },
      data: { locked },
      select: { id: true, locked: true },
    });
    return Response.json(guild);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return Response.json({ error: "Ce serveur n'est pas dans la liste." }, { status: 404 });
    }
    console.error(`PATCH /api/admin/guilds/${id}`, error);
    return Response.json({ error: "Le verrou n'a pas pu être changé." }, { status: 500 });
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
