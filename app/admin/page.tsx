import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminView } from "./AdminView";

/**
 * Espace admin. Page serveur pour une seule raison : le rôle n'est pas dans la session
 * — il est relu en base à chaque écriture, pour qu'une session ouverte avant un
 * changement de rôle ne garde pas d'anciens droits. C'est donc ici qu'on le lit, et
 * `AdminView` n'en fait qu'un affichage : `POST /api/soirees` revérifie avant d'écrire.
 */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  // Pas de ligne User tant que le membre n'a rien écrit : il n'est alors pas admin.
  const actor = await prisma.user.findUnique({
    where: { discordId: session.user.id },
    select: { role: true },
  });

  return <AdminView isAdmin={actor?.role === "ADMIN"} />;
}
