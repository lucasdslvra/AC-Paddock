import { auth } from "@/auth";
import { normalizeTagName } from "@/lib/mods/tags";
import { prisma } from "@/lib/prisma";

/** Assez de propositions pour couvrir la saisie sans noyer la liste déroulante. */
const SUGGESTION_LIMIT = 8;

/**
 * Sans `query`, la route sert le vocabulaire complet : c'est ce que consomme le
 * sélecteur multi-tags du catalogue (US-C2), qui les affiche tous.
 */
const CATALOGUE_LIMIT = 60;

/**
 * US-C1 — autocomplétion des tags.
 *
 * Le cahier §2.2 en donne la raison : proposer l'existant « pour éviter les
 * doublons/variantes ». La recherche porte sur la forme normalisée du terme saisi
 * (`normalizeTagName`), la même que celle stockée en base — taper `Drift` ou `drift`
 * ramène donc le même tag, sans avoir besoin d'une comparaison insensible à la casse.
 *
 * Les tags les plus utilisés sortent en premier : c'est le vocabulaire déjà adopté par
 * le groupe, celui vers lequel on veut faire converger les nouvelles fiches.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeTagName(searchParams.get("query") ?? "");

  try {
    const tags = await prisma.tag.findMany({
      where: query ? { name: { contains: query } } : undefined,
      select: { name: true, _count: { select: { mods: true } } },
      orderBy: [{ mods: { _count: "desc" } }, { name: "asc" }],
      take: query ? SUGGESTION_LIMIT : CATALOGUE_LIMIT,
    });

    // `modCount` sert à afficher « 4 fiches » à côté d'une proposition : c'est ce qui
    // permet de distinguer un tag installé d'une variante créée une fois par erreur.
    return Response.json(tags.map((tag) => ({ name: tag.name, modCount: tag._count.mods })));
  } catch (error) {
    console.error("GET /api/tags", error);
    return Response.json({ error: "Les tags n'ont pas pu être chargés." }, { status: 500 });
  }
}
