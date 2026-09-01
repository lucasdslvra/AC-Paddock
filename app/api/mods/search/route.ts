import { auth } from "@/auth";
import { MIN_NAME_QUERY_LENGTH, SIMILAR_MODS_LIMIT } from "@/lib/mods/duplicates";
import { escapeLikeWildcards } from "@/lib/mods/like";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { prisma } from "@/lib/prisma";
import { soireeContext } from "@/lib/soirees/current";

/**
 * US-D1 — recherche floue sur le nom, pour repérer une fiche déjà existante avant d'en
 * créer une seconde (cahier §2.4).
 *
 * Deux façons d'être « proche », réunies par un OU :
 * - `%`, l'opérateur de similarité trigram de pg_trgm : il rattrape les fautes de
 *   frappe et les variantes d'orthographe (`silvia s15` ↔ `Silvia S-15`) ;
 * - `ILIKE '%…%'` : il rattrape le cas inverse, un terme court exactement contenu dans
 *   un nom long, où la similarité globale reste sous le seuil (`silvia` ↔ `Nissan
 *   Silvia S15 — Rocket Bunny`).
 *
 * Les deux passent par l'index GIN trigram posé sur `Mod.name` (migration
 * `20260829200000_duplicate_detection`). L'opérateur et la fonction sont qualifiés par
 * leur schéma : Supabase installe les extensions dans `extensions`, et on ne veut pas
 * dépendre du `search_path` du rôle de connexion.
 *
 * Le classement se fait par similarité décroissante — la fiche la plus probablement
 * identique en premier.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("name") ?? "").trim();

  if (query.length < MIN_NAME_QUERY_LENGTH) {
    return Response.json([]);
  }

  const soiree = await soireeContext(session);

  try {
    // Deux requêtes plutôt qu'une : le SQL brut classe les fiches, `findMany` les
    // recharge avec leurs relations pour que la réponse ait la forme d'un mod d'API
    // (tags et auteur compris) comme partout ailleurs.
    const ranked = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Mod"
      WHERE "name" OPERATOR(extensions.%) ${query}
         OR "name" ILIKE ${`%${escapeLikeWildcards(query)}%`}
      ORDER BY extensions.similarity("name", ${query}) DESC, "createdAt" DESC
      LIMIT ${SIMILAR_MODS_LIMIT}
    `;

    if (ranked.length === 0) {
      return Response.json([]);
    }

    const mods = await prisma.mod.findMany({
      where: { id: { in: ranked.map(({ id }) => id) } },
      include: modInclude(session.user.id, soiree),
    });

    // `findMany` ne garantit aucun ordre : on rétablit celui du classement.
    const byId = new Map(mods.map((mod) => [mod.id, mod]));
    return Response.json(
      ranked
        .map(({ id }) => byId.get(id))
        .filter((mod) => mod !== undefined)
        .map((mod) => serializeMod(mod, soiree.current?.id ?? null)),
    );
  } catch (error) {
    console.error("GET /api/mods/search", error);
    return Response.json({ error: "La recherche n'a pas pu aboutir." }, { status: 500 });
  }
}
