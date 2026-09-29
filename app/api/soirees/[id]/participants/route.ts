import type { Session } from "next-auth";
import { auth } from "@/auth";
import { upsertSessionUser } from "@/lib/session-user";
import { soireeContext } from "@/lib/soirees/current";
import { joinSoiree, leaveSoiree } from "@/lib/soirees/participants";
import { isVoteOpen, voteClosedMessage } from "@/lib/soirees/phase";

/**
 * La soirée qu'on rejoint ou qu'on quitte, une fois vérifié qu'elle l'accepte encore.
 *
 * Seule la soirée en cours du serveur du membre, et seulement tant que le vote est
 * ouvert : s'inscrire après la fermeture n'ouvrirait plus rien, et partir après
 * emporterait des votes d'un classement déjà figé — celui que le groupe télécharge.
 */
async function resolveSoiree(soireeId: string, session: Session) {
  const { current } = await soireeContext(session);

  if (soireeId !== current?.id) {
    return { error: "Cette soirée n'est plus ouverte aux inscriptions.", status: 409 as const };
  }
  if (!isVoteOpen(current.date)) {
    return { error: voteClosedMessage(current.date), status: 409 as const };
  }

  return { soiree: current };
}

/** Rejoindre la soirée en cours. Idempotent. */
export async function POST(_request: Request, ctx: RouteContext<"/api/soirees/[id]/participants">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const resolved = await resolveSoiree(id, session);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    // Rejoindre est souvent la première écriture d'un membre : sa ligne `User` peut
    // très bien ne pas exister encore.
    const member = await upsertSessionUser(session.user);
    await joinSoiree(member.id, resolved.soiree.id);

    return Response.json({ joined: true });
  } catch (error) {
    console.error(`POST /api/soirees/${id}/participants`, error);
    return Response.json({ error: "Impossible de rejoindre la soirée." }, { status: 500 });
  }
}

/** Quitter la soirée en cours — et retirer ses votes (`leaveSoiree`). Idempotent. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/soirees/[id]/participants">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const resolved = await resolveSoiree(id, session);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    const member = await upsertSessionUser(session.user);
    await leaveSoiree(member.id, resolved.soiree.id);

    return Response.json({ joined: false });
  } catch (error) {
    console.error(`DELETE /api/soirees/${id}/participants`, error);
    return Response.json({ error: "Impossible de quitter la soirée." }, { status: 500 });
  }
}
