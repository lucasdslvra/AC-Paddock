import { auth } from "@/auth";
import type { UrlCheckResult } from "@/lib/mods/duplicates";
import { modInclude, serializeMod } from "@/lib/mods/serialize";
import { normalizeModUrl } from "@/lib/mods/url";
import { prisma } from "@/lib/prisma";

/**
 * US-D2 — le lien saisi est-il déjà sur une fiche ?
 *
 * La comparaison porte sur la forme normalisée du lien (`normalizeModUrl`), stockée
 * dans `Mod.urlKey` à chaque écriture : c'est ce qui fait qu'un lien recopié depuis
 * Discord, avec ses paramètres de suivi et sa majuscule de domaine, retrouve quand
 * même la fiche existante (cahier §2.4).
 *
 * Un lien illisible n'est pas une erreur ici : le champ est encore en cours de saisie,
 * et c'est la validation du formulaire qui le refusera. On répond simplement « aucune
 * correspondance ».
 *
 * La plus ancienne fiche l'emporte en cas d'égalité : c'est celle vers laquelle on veut
 * ramener les contributions, la détection ne bloquant jamais la création (US-D3).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const urlKey = normalizeModUrl(searchParams.get("url") ?? "");

  if (!urlKey) {
    return Response.json({ match: null } satisfies UrlCheckResult);
  }

  try {
    // Aucune fiche à écarter du résultat : le formulaire n'interroge cette route qu'à
    // la création (US-D3). Le jour où l'édition la sollicitera, il faudra exclure la
    // fiche modifiée, qui se trouverait elle-même.
    const mod = await prisma.mod.findFirst({
      where: { urlKey },
      include: modInclude,
      orderBy: { createdAt: "asc" },
    });

    return Response.json({ match: mod ? serializeMod(mod) : null } satisfies UrlCheckResult);
  } catch (error) {
    console.error("GET /api/mods/check-url", error);
    return Response.json({ error: "La vérification du lien a échoué." }, { status: 500 });
  }
}
