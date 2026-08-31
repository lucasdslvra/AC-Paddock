import { recordDeletion } from "@/lib/admin/deletion-log";
import { requireAdmin } from "@/lib/admin/guard";
import { normalizeTagName } from "@/lib/mods/tags";
import { prisma } from "@/lib/prisma";

/**
 * US-K2 — suppression d'un tag, réservée aux admins.
 *
 * Le vocabulaire est alimenté librement par les membres (cahier §2.2) : il s'y dépose
 * donc des fautes de frappe et des variantes que l'autocomplétion (US-C1) ne fait que
 * propager. Les retirer est un acte de modération, pas d'édition — d'où le rôle admin,
 * là où compléter une fiche reste ouvert à tous (US-B3).
 *
 * Le tag part avec ses associations (`ModTag`, `onDelete: Cascade`) : les fiches qui le
 * portaient restent intactes, elles perdent une pastille. C'est la contrepartie du
 * choix inverse fait pour les fiches — supprimer une fiche ne supprime pas ses tags,
 * qui appartiennent au vocabulaire commun.
 *
 * Le nom est normalisé avant recherche, comme partout : `/api/tags/Drift` et
 * `/api/tags/drift` désignent le même tag, celui que la base stocke.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/tags/[name]">) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { name } = await ctx.params;
  const normalized = normalizeTagName(decodeURIComponent(name));

  if (!normalized) {
    return Response.json({ error: "Nom de tag manquant." }, { status: 400 });
  }

  try {
    const tag = await prisma.tag.findUnique({
      where: { name: normalized },
      select: { id: true, name: true, _count: { select: { mods: true } } },
    });

    if (!tag) {
      return Response.json({ error: "Ce tag n'existe pas." }, { status: 404 });
    }

    await prisma.tag.delete({ where: { id: tag.id } });

    await recordDeletion({
      target: "TAG",
      targetId: tag.id,
      label: tag.name,
      detail: `${tag._count.mods} fiche${tag._count.mods > 1 ? "s" : ""} concernée${
        tag._count.mods > 1 ? "s" : ""
      }`,
      asAdmin: true,
      actorId: guard.actor.id,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/tags/${normalized}`, error);
    return Response.json({ error: "Le tag n'a pas pu être supprimé." }, { status: 500 });
  }
}
