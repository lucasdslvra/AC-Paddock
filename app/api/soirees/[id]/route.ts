import { after } from "next/server";
import { auth } from "@/auth";
import { recordDeletion } from "@/lib/admin/deletion-log";
import { requireAdmin } from "@/lib/admin/guard";
import { notifySoireeCancelled } from "@/lib/discord/notify";
import { prisma } from "@/lib/prisma";
import { soireeContext } from "@/lib/soirees/current";
import { formatSoireeDate } from "@/lib/soirees/format";
import { serializeSoiree, soireeInclude } from "@/lib/soirees/serialize";
import { drawTieBreaks } from "@/lib/soirees/tie-break";
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
    const viewer = await soireeContext(session);

    // Avant de lire le classement, pas après : si le vote de cette soirée vient de
    // fermer, c'est cette lecture qui tire au sort ses ex æquo (`drawTieBreaks`), et le
    // classement doit être celui d'après le tirage. Sans effet le reste du temps —
    // vote encore ouvert, ou tirage déjà fait.
    await drawTieBreaks({ soireeId: id, guildId: viewer.guildId });

    const [soiree, voterCount] = await Promise.all([
      prisma.soiree.findUnique({
        where: { id },
        include: soireeInclude(session.user.id, viewer),
      }),
      countSoireeVoters(id),
    ]);

    // Une soirée d'un autre serveur n'existe pas pour ce membre : le même 404 que pour
    // un identifiant inventé, sans lui apprendre qu'elle existe ailleurs.
    if (!soiree || soiree.guildId !== viewer.guildId) {
      return Response.json({ error: "Cette soirée n'existe pas." }, { status: 404 });
    }

    return Response.json(
      serializeSoiree(soiree, {
        isCurrent: soiree.id === viewer.current?.id,
        voterCount,
        currentSoireeId: viewer.current?.id ?? null,
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
 *
 * Aucune restriction de serveur, contrairement à la lecture : c'est l'admin qui attribue
 * les soirées à un serveur (US-G1), il faut donc qu'il puisse reprendre celles qu'il a
 * posées ailleurs — y compris dans un serveur retiré depuis de la liste des autorisés,
 * qui resterait sinon impossible à nettoyer.
 *
 * US-L1 — le salon du serveur concerné est prévenu, mais seulement d'une soirée encore
 * à venir : c'est ce qu'« annulée » veut dire. Défaire une soirée dont l'heure est
 * passée est un ménage d'archive — trier les anciennes ne doit rien annoncer du tout.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/soirees/[id]">) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  try {
    const soiree = await prisma.soiree.findUnique({
      where: { id },
      // `guildId` : c'est le salon de ce serveur-là, et de lui seul, qui est prévenu.
      select: {
        id: true,
        name: true,
        date: true,
        guildId: true,
        _count: { select: { mods: true } },
      },
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

    // US-L1 — l'annonce part après la réponse, comme celle de la création : la
    // suppression est faite, et Discord ne doit ni la retarder ni pouvoir la faire
    // échouer.
    //
    // Le seuil est l'instant présent, et non le début du jour de `currentSoiree` : une
    // soirée dont l'heure est passée a eu lieu, la défaire est du rangement. Ce n'est
    // donc pas tout à fait « la soirée en cours » qu'on annonce, mais « une soirée qui
    // n'a pas encore commencé » — la seule qu'on puisse encore annuler à quelqu'un.
    if (soiree.date > new Date()) {
      after(() =>
        notifySoireeCancelled({
          guildId: soiree.guildId,
          name: soiree.name,
          date: soiree.date,
          cancelledBy: guard.actor.username,
          modCount: soiree._count.mods,
          voteCount,
        }),
      );
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`DELETE /api/soirees/${id}`, error);
    return Response.json({ error: "La soirée n'a pas pu être supprimée." }, { status: 500 });
  }
}
