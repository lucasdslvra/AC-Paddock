import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Retirer un mod d'une soirée. Le backlog ne le demande pas, mais un sélecteur qui
 * n'ajoute qu'en un sens rend la moindre erreur de clic définitive — et le cahier §2.5
 * décrit une liste qu'on garnit avant la soirée, donc qu'on corrige.
 *
 * Les votes reçus par cet engagement partent avec lui (`onDelete: Cascade`) : ils ne
 * désignent plus rien une fois l'association défaite. C'est aussi pourquoi le retrait
 * suit la même règle que la suppression d'une fiche (cahier §2.6) — celui qui a engagé
 * le mod, ou un admin. Un membre ne peut pas effacer les votes des autres d'un clic.
 */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/soirees/[id]/mods/[modId]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id, modId } = await ctx.params;

  try {
    const [engagement, actor] = await Promise.all([
      prisma.soireeMod.findUnique({
        where: { soireeId_modId: { soireeId: id, modId } },
        select: { id: true, engagedById: true },
      }),
      // Le rôle n'est pas dans la session : on le relit en base, ce qui évite qu'une
      // session ouverte avant un changement de rôle garde d'anciens droits.
      prisma.user.findUnique({
        where: { discordId: session.user.id },
        select: { id: true, role: true },
      }),
    ]);

    // Idempotent, comme le retrait d'un vote : un mod déjà désengagé est le résultat
    // voulu, pas une erreur à afficher.
    if (!engagement) {
      return new Response(null, { status: 204 });
    }

    if (!actor || (actor.role !== "ADMIN" && actor.id !== engagement.engagedById)) {
      return Response.json(
        { error: "Seuls le membre qui a engagé ce mod et les admins peuvent le retirer." },
        { status: 403 },
      );
    }

    await prisma.soireeMod.delete({ where: { id: engagement.id } });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/soirees/${id}/mods/${modId}`, error);
    return Response.json({ error: "Ce mod n'a pas pu être retiré." }, { status: 500 });
  }
}
