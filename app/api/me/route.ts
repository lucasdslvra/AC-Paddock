import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * US-K1 — « lien visible admin uniquement ».
 *
 * Le rôle n'est pas dans la session : il est relu en base à chaque écriture, pour
 * qu'une session ouverte avant un changement de rôle ne garde pas d'anciens droits
 * (voir `requireAdmin`). L'en-tête, lui, est un composant client rendu sur toutes les
 * pages, y compris celles qui n'interrogent pas la base — il a besoin de poser la
 * question quelque part, et c'est ici.
 *
 * La route est volontairement hors de `/api/admin/*` : elle répond à tout membre
 * connecté, un non-admin obtenant `isAdmin: false` et non un 403. Elle ne décide de
 * rien — masquer un lien n'est pas une protection, ce sont le layout `/admin` et les
 * gardes des routes qui refusent l'accès.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  }

  try {
    // Pas de ligne User tant que le membre n'a rien écrit : il n'est alors pas admin.
    const actor = await prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { role: true },
    });

    return Response.json({ isAdmin: actor?.role === "ADMIN" });
  } catch (error) {
    console.error("GET /api/me", error);
    return Response.json({ error: "Le profil n'a pas pu être chargé." }, { status: 500 });
  }
}
