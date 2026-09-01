import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sessionGuildId } from "@/lib/session-user";
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

  // L'archive est celle du serveur du membre : chaque groupe a joué ses soirées.
  const guildId = await sessionGuildId(session);

  const [soirees, memberCount] = await Promise.all([
    listPastSoirees(guildId),
    // Le dénominateur de « 6 / 9 ont voté », comme sur la soirée en cours : les membres
    // de ce serveur que l'application a déjà vus se connecter.
    prisma.user.count({ where: { guildId } }),
  ]);

  return <HistoriqueView soirees={soirees} memberCount={memberCount} />;
}
