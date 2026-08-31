import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { prisma } from "@/lib/prisma";

/**
 * US-K1 — la section `/admin` et son layout dédié.
 *
 * Le layout porte deux choses, et c'est pour ça qu'il existe plutôt que de laisser
 * chaque page s'en occuper :
 *
 *   · le contrôle de rôle, appliqué à tout ce qui vit sous `/admin` — une page ajoutée
 *     demain est protégée sans que personne n'ait à y penser ;
 *   · l'en-tête sombre « ESPACE ADMIN », qui distingue la section du reste du site.
 *
 * Le rôle est relu en base à chaque rendu, comme partout ailleurs : une session ouverte
 * avant un changement de rôle ne garde pas d'anciens droits. Ce contrôle-ci ne protège
 * que l'affichage — les écritures passent par `requireAdmin`, qui refait la vérification
 * côté route.
 *
 * Un non-admin est renvoyé au catalogue, pas à la page de connexion : il est bien
 * connecté, c'est cette section-là qui ne le concerne pas.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  // Pas de ligne User tant que le membre n'a rien écrit : il n'est alors pas admin.
  const actor = await prisma.user.findUnique({
    where: { discordId: session.user.id },
    select: { role: true },
  });

  if (actor?.role !== "ADMIN") redirect("/catalogue");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader variant="admin" />
      {children}
    </div>
  );
}
