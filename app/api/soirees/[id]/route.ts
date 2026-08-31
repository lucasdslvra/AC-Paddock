import { auth } from "@/auth";
import { recordDeletion } from "@/lib/admin/deletion-log";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { currentSoiree } from "@/lib/soirees/current";
import { formatSoireeDate } from "@/lib/soirees/format";
import { serializeSoiree, soireeInclude } from "@/lib/soirees/serialize";
import { countSoireeVoters } from "@/lib/soirees/vote";

/**
 * US-G4 — une soirée et son classement, mods triés par votes décroissants.
 *
 * Le tri est fait par la base (`soireeInclude`), pas ici : c'est le même résultat, mais
 * sans avoir à tout charger pour le réordonner ensuite.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/soirees/[id]">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    // La soirée en cours est demandée même quand on lit une soirée passée : c'est elle
    // qui décide de ce qui est votable, et `soireeInclude` la passe à `modInclude`.
    const current = await currentSoiree();

    const [soiree, voterCount] = await Promise.all([
      prisma.soiree.findUnique({
        where: { id },
        include: soireeInclude(session.user.id, current),
      }),
      countSoireeVoters(id),
    ]);

    if (!soiree) {
      return Response.json({ error: "Cette soirée n'existe pas." }, { status: 404 });
    }

    return Response.json(
      serializeSoiree(soiree, {
        isCurrent: soiree.id === current?.id,
        voterCount,
        currentSoireeId: current?.id ?? null,
      }),
    );
  } catch (error) {
    console.error(`GET /api/soirees/${id}`, error);
    return Response.json({ error: "Cette soirée n'a pas pu être chargée." }, { status: 500 });
  }
}

/**
 * US-K2 — suppression d'une soirée, réservée aux admins.
 *
 * C'est l'admin qui crée les soirées (US-G1, cahier §2.6) : c'est lui qui répare une
 * date fautive, et personne d'autre ne doit pouvoir faire disparaître une soirée où le
 * groupe a voté.
 *
 * La soirée emporte ses engagements (`SoireeMod`, `onDelete: Cascade`) et, avec eux,
 * les votes qui s'y rattachaient — un vote ne veut plus rien dire une fois la soirée
 * défaite. Les fiches, elles, restent au catalogue : c'est tout l'objet de la
 * séparation entre `Mod` et `SoireeMod`.
 *
 * Rien n'interdit de supprimer la soirée en cours : c'est le cas d'usage principal (une
 * soirée créée à la mauvaise date, qui capte les votes de tout le monde). La suivante
 * devient alors la soirée en cours, et `currentSoiree` le voit sans qu'on ait rien à
 * basculer.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/soirees/[id]">) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  try {
    const soiree = await prisma.soiree.findUnique({
      where: { id },
      select: { id: true, name: true, date: true, _count: { select: { mods: true } } },
    });

    if (!soiree) {
      return Response.json({ error: "Cette soirée n'existe pas." }, { status: 404 });
    }

    // Compté avant la suppression : après, la cascade les a emportés et le journal ne
    // pourrait plus dire ce qu'elle a coûté.
    const voteCount = await prisma.vote.count({ where: { soireeMod: { soireeId: id } } });

    await prisma.soiree.delete({ where: { id } });

    await recordDeletion({
      target: "SOIREE",
      targetId: soiree.id,
      label: `${formatSoireeDate(soiree.date)}${soiree.name ? ` · ${soiree.name}` : ""}`,
      detail: `${soiree._count.mods} mod${soiree._count.mods > 1 ? "s" : ""} engagé${
        soiree._count.mods > 1 ? "s" : ""
      } · ${voteCount} vote${voteCount > 1 ? "s" : ""}`,
      asAdmin: true,
      actorId: guard.actor.id,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/soirees/${id}`, error);
    return Response.json({ error: "La soirée n'a pas pu être supprimée." }, { status: 500 });
  }
}
