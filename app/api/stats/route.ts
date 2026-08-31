import { auth } from "@/auth";
import { countSiteStats } from "@/lib/stats";

/**
 * Les compteurs du site, pour l'en-tête du catalogue.
 *
 * L'en-tête est un composant client rendu sur des pages qui n'interrogent pas toutes
 * la base : comme `GET /api/me`, il lui faut un endroit où poser la question. La page
 * de connexion, elle, est rendue côté serveur et appelle `countSiteStats` directement
 * — elle n'a pas à repasser par le réseau pour trois nombres.
 *
 * Réservée aux membres connectés, comme le reste de l'API : les chiffres affichés
 * avant connexion sont ceux que le serveur a déjà rendus dans la page.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    return Response.json(await countSiteStats());
  } catch (error) {
    console.error("GET /api/stats", error);
    return Response.json({ error: "Les compteurs n'ont pas pu être chargés." }, { status: 500 });
  }
}
