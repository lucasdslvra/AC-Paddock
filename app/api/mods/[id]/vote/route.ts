import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sessionGuildId, upsertSessionUser } from "@/lib/session-user";
import { currentSoiree } from "@/lib/soirees/current";
import { isVoteOpen, voteClosedMessage } from "@/lib/soirees/phase";
import { castVote, readVoteState, retractVote } from "@/lib/soirees/vote";

/**
 * Voter pour un mod depuis le catalogue ou depuis sa fiche (US-F1), c'est-à-dire sans
 * nommer de soirée.
 *
 * Depuis US-G3, un vote n'existe que dans le cadre d'une soirée : cette route résout
 * donc la soirée en cours, et c'est la **même réserve** que celle de la page soirée —
 * les mêmes lignes, le même quota. Les trois boutons de l'application écrivent au même
 * endroit, ce qui est exactement ce qu'on attend d'eux : cliquer depuis une carte puis
 * rouvrir la soirée doit montrer les votes déjà là.
 *
 * Elle existe en plus de `/api/soirees/[id]/mods/[modId]/vote` parce que le catalogue
 * n'a aucune raison de connaître l'identifiant de la soirée du soir. Il tient une
 * fiche ; le serveur sait où on en est.
 */
async function resolveEngagement(modId: string, session: Session) {
  // La soirée en cours **du serveur de ce membre** : deux groupes peuvent jouer le même
  // soir, et un vote n'appartient qu'à l'un des deux classements.
  const soiree = await currentSoiree(await sessionGuildId(session));

  if (!soiree) {
    return {
      error: "Aucune soirée n'est programmée : le vote rouvrira avec la prochaine.",
      status: 409 as const,
    };
  }

  // Le vote ferme 30 min avant le départ (`VOTE_CLOSES_BEFORE_MS`) : passé cette heure,
  // le classement est figé et les mods retenus se téléchargent. La soirée reste « en
  // cours » jusqu'au lendemain — c'est bien deux choses différentes.
  if (!isVoteOpen(soiree.date)) {
    return { error: voteClosedMessage(soiree.date), status: 409 as const };
  }

  const engagement = await prisma.soireeMod.findUnique({
    where: { soireeId_modId: { soireeId: soiree.id, modId } },
    // Le type de la fiche vient avec l'engagement : c'est lui qui désigne le quota du
    // membre (8 véhicules, 3 circuits — `VOTE_QUOTA`), et le relire à part ferait un
    // aller-retour de plus pour une colonne déjà sur le chemin.
    select: { id: true, soireeId: true, mod: { select: { type: true } } },
  });

  if (!engagement) {
    // La règle de l'Epic G, telle que le membre la rencontre : seuls les mods engagés
    // dans la soirée en cours sont votables. On distingue quand même la fiche
    // inexistante, qui n'est pas la même erreur.
    const mod = await prisma.mod.findUnique({ where: { id: modId }, select: { id: true } });
    return mod
      ? {
          error: "Ce mod n'est pas engagé dans la soirée en cours : engage-le d'abord.",
          status: 409 as const,
        }
      : { error: "Cette fiche n'existe pas.", status: 404 as const };
  }

  return { engagement };
}

/** US-F1 / US-G3 — poser un vote de plus sur un mod dans la soirée en cours. */
export async function POST(_request: Request, ctx: RouteContext<"/api/mods/[id]/vote">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const resolved = await resolveEngagement(id, session);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    // Voter est souvent la première écriture d'un membre : sa ligne `User` peut très
    // bien ne pas exister encore.
    const voter = await upsertSessionUser(session.user);

    // `castVote` porte la règle des quotas : chaque appel ajoute une voix, et celle de
    // trop est refusée — ici comme depuis la page soirée, puisque c'est la même réserve
    // qui se vide.
    const rejected = await castVote({
      userId: voter.id,
      modId: id,
      type: resolved.engagement.mod.type,
      soireeId: resolved.engagement.soireeId,
      soireeModId: resolved.engagement.id,
    });
    if (rejected) {
      return Response.json({ error: rejected.error }, { status: rejected.status });
    }

    return Response.json(await readVoteState(id, resolved.engagement.id, voter.id));
  } catch (error) {
    console.error(`POST /api/mods/${id}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être enregistré." }, { status: 500 });
  }
}

/**
 * US-F1 — retirer un vote, le dernier posé sur ce mod. Idempotente : retirer un vote
 * qu'on n'a pas est déjà le résultat voulu.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/mods/[id]/vote">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const resolved = await resolveEngagement(id, session);
    if ("error" in resolved) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    // Rien à créer ici, contrairement au POST : sans ligne `User`, ce membre n'a jamais
    // rien écrit, donc jamais voté.
    const voter = await prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { id: true },
    });

    if (voter) {
      await retractVote({ userId: voter.id, soireeModId: resolved.engagement.id });
    }

    // Sans ligne `User`, aucun vote à compter : `readVoteState` rendra `myVotes: 0` sur
    // un identifiant qui n'existe pas, ce qui est exactement l'état de ce membre.
    return Response.json(await readVoteState(id, resolved.engagement.id, voter?.id ?? ""));
  } catch (error) {
    console.error(`DELETE /api/mods/${id}/vote`, error);
    return Response.json({ error: "Ton vote n'a pas pu être retiré." }, { status: 500 });
  }
}
