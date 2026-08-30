import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { currentSoiree } from "@/lib/soirees/current";
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
