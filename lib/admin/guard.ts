import "server-only";
import { auth } from "@/auth";
import type { Actor } from "@/lib/mods/permissions";
import { prisma } from "@/lib/prisma";

/**
 * US-K1 — le garde de rôle des routes `/api/admin/*`, et de toute écriture réservée à
 * un admin (suppression d'un tag ou d'une soirée, US-K2).
 *
 * C'est un garde appelé par chaque route, pas un `proxy.ts` : le rôle est en base, et
 * Next.js prévient qu'un proxy ne doit pas dépendre de modules partagés — il est
 * optimisé pour être déployé sur le CDN, loin de la base. Un garde à l'entrée de
 * chaque route lit donc le rôle là où il est, et une session ouverte avant un
 * changement de rôle ne garde aucun droit périmé — la même règle que partout ailleurs
 * (`DELETE /api/mods/[id]`, `POST /api/soirees`).
 *
 * Le pseudo vient avec le rôle : les écritures d'admin se racontent — au journal des
 * suppressions comme dans le salon Discord (US-L1) —, et le relire plus tard coûterait
 * un aller-retour de plus pour une colonne déjà sur la ligne.
 *
 * Renvoie soit l'acteur, soit la réponse à retourner telle quelle :
 *
 * ```ts
 * const guard = await requireAdmin();
 * if (!guard.ok) return guard.response;
 * ```
 */
/** L'acteur d'une écriture d'admin : de quoi vérifier son droit, et de quoi le nommer. */
export type AdminActor = Actor & { username: string };

export type AdminGuard =
  | { ok: true; actor: AdminActor }
  | { ok: false; response: Response };

export async function requireAdmin(): Promise<AdminGuard> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: Response.json({ error: "Connexion requise." }, { status: 401 }),
    };
  }

  // Pas de ligne `User` tant que le membre n'a rien écrit : il n'est alors pas admin.
  const actor = await prisma.user.findUnique({
    where: { discordId: session.user.id },
    select: { id: true, role: true, username: true },
  });

  if (actor?.role !== "ADMIN") {
    return {
      ok: false,
      response: Response.json({ error: "Réservé aux admins." }, { status: 403 }),
    };
  }

  return { ok: true, actor };
}
