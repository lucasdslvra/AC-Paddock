import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * La porte d'entrée du site (`/`) est l'écran de connexion, et elle est prérendue :
 * elle ne lit aucune session (voir `app/page.tsx`, qui la veut statique pour le
 * trafic anonyme). Un membre déjà connecté y retombait donc à chaque visite, devant
 * le bouton « Se connecter avec Discord » — sa session était pourtant toujours là,
 * mais rien ne la regardait avant qu'il ne reclique. C'est ici qu'on la regarde.
 *
 * Le proxy s'exécute avant le cache de la page : c'est le seul endroit d'où l'on
 * peut dévier `/` sans rendre la page dynamique pour tout le monde.
 *
 * Depuis Next 16, `middleware.ts` s'appelle `proxy.ts` et tourne par défaut sur le
 * runtime Node — d'où la lecture directe du jeton, sans passer par `auth()` : ce
 * dernier tirerait Prisma et la configuration Discord dans chaque requête, pour une
 * question à laquelle le cookie répond seul.
 */

/** Le cookie de session, tel que `@auth/core` le nomme selon le protocole. */
function isSecureRequest(request: NextRequest): boolean {
  // Derrière un proxy (Vercel), `x-forwarded-proto` fait foi : `nextUrl.protocol`
  // peut rester `http:` alors que le navigateur, lui, parle en HTTPS — et le cookie
  // porte alors le préfixe `__Secure-`.
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}

export async function proxy(request: NextRequest) {
  // `?error=` vient d'un refus OAuth : l'écran a quelque chose à dire, on ne le
  // court-circuite pas — même si un cookie valide traîne encore d'avant.
  if (request.nextUrl.searchParams.has("error")) return NextResponse.next();

  const secureCookie = isSecureRequest(request);
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET!,
    secureCookie,
  });

  // Pas de jeton, ou un jeton illisible (secret changé, session expirée) : `getToken`
  // rend `null` et le visiteur voit l'écran de connexion. C'est ce qui empêche la
  // boucle avec `useRequireAuth`, qui renvoie ici tout ce que le catalogue refuse.
  if (!token?.discordId) return NextResponse.next();

  const destination = new URL("/catalogue", request.url);
  // `?theme=` est lu par le script anti-flash du layout : il doit survivre au saut.
  destination.search = request.nextUrl.search;
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: "/",
};
