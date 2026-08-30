import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listPastSoirees } from "@/lib/soirees/past";
import { HistoriqueView } from "./HistoriqueView";

/**
 * US-I1 — « Historique des soirées ».
 *
 * Page serveur, comme la soirée en cours : la liste est triée et bornée par la base, et
 * rien n'y est modifiable — les votes d'une soirée passée sont clos. Elle lit Prisma
 * directement plutôt que d'appeler `GET /api/soirees?past=true` : les deux passent par
 * `listPastSoirees`, la route servant les appels venus du navigateur.
 */
export default async function HistoriquePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [soirees, memberCount] = await Promise.all([
    listPastSoirees(),
    // Le dénominateur de « 6 / 9 ont voté », comme sur la soirée en cours : les membres
    // que l'application a déjà vus écrire quelque chose.
    prisma.user.count(),
  ]);

  return <HistoriqueView soirees={soirees} memberCount={memberCount} />;
}
