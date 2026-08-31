import { auth } from "@/auth";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { prisma } from "@/lib/prisma";
import { currentSoiree } from "@/lib/soirees/current";

/**
 * Retirer un lien secondaire d'une fiche.
 *
 * Ouvert à tout membre, comme le reste de la fiche (US-B3, usage wiki) et non au seul
 * membre qui l'a ajouté : un miroir mort doit pouvoir être retiré par celui qui s'en
 * aperçoit. Rien ne se perd au passage — un lien n'emporte ni vote ni fichier, à la
 * différence d'un engagement en soirée.
 *
 * Le lien principal (`Mod.url`) n'est pas concerné : il n'est pas dans cette table, et
 * une fiche sans lien n'aurait plus d'objet — il se remplace, il ne se retire pas.
 */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/mods/[id]/links/[linkId]">,
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id, linkId } = await ctx.params;

  try {
    const link = await prisma.modLink.findUnique({
      where: { id: linkId },
      select: { id: true, modId: true },
    });

    // L'identifiant de la fiche est vérifié, pas seulement lu dans l'URL : sans ça, un
    // lien d'une autre fiche partirait par un chemin qui prétend le contraire.
    if (!link || link.modId !== id) {
      return Response.json({ error: "Ce lien n'existe pas." }, { status: 404 });
    }

    await prisma.modLink.delete({ where: { id: link.id } });

    const soiree = await currentSoiree();
    const updated = await prisma.mod.findUniqueOrThrow({
      where: { id },
      include: modInclude(session.user.id, soiree),
    });

    return Response.json(serializeMod(updated, soiree?.id ?? null));
  } catch (error) {
    console.error(`DELETE /api/mods/${id}/links/${linkId}`, error);
    return Response.json({ error: "Ce lien n'a pas pu être retiré." }, { status: 500 });
  }
}
