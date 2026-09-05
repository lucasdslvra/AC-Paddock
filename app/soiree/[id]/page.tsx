import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { settleSoirees } from "@/lib/soirees/closing";
import { soireeContext, startOfToday } from "@/lib/soirees/current";
import { serializeSoiree, soireeInclude } from "@/lib/soirees/serialize";
import { countSoireeVoters } from "@/lib/soirees/vote";
import { SoireeView } from "../SoireeView";

/**
 * US-I2 — le détail d'une soirée désignée, en lecture seule dès qu'elle n'est plus la
 * soirée en cours.
 *
 * Même page que `/soiree`, à ceci près qu'elle lit un identifiant plutôt que la soirée
 * en cours : c'est le même compte rendu, avec le même classement, et le dupliquer aurait
 * fait diverger les deux au premier changement. `/soiree/[id]` pointé sur la soirée en
 * cours redonne donc exactement `/soiree`, boutons de vote compris — c'est ce que suit
 * un lien parti de l'historique vers une soirée qui vient d'être reprogrammée.
 *
 * Le backlog ne demande pas de route API dédiée : `GET /api/soirees/[id]` (US-G4) sert
 * déjà cette lecture, et cette page passe par le même `soireeInclude`.
 */
export default async function SoireeDetailPage(props: PageProps<"/soiree/[id]">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { id } = await props.params;

  // La soirée en cours est demandée même pour lire une soirée passée : c'est elle qui
  // décide de ce qui est votable, et `soireeInclude` la transmet à `modInclude`.
  const viewer = await soireeContext(session);
  const current = viewer.current;

  // Même raison qu'ailleurs : le tirage des ex æquo précède la lecture du classement,
  // pour que la page montre le résultat du sort et non l'ordre d'attente — et le tirage
  // d'une soirée qui vient de fermer emporte les fichiers qu'elle ne retient pas.
  await settleSoirees({ soireeId: id, guildId: viewer.guildId });

  const [soiree, voterCount, memberCount, actor] = await Promise.all([
    prisma.soiree.findUnique({
      where: { id },
      include: soireeInclude(session.user.id, viewer),
    }),
    countSoireeVoters(id),
    prisma.user.count({ where: { guildId: viewer.guildId } }),
    prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { role: true },
    }),
  ]);

  // La soirée d'un autre serveur est introuvable, pas interdite : ce membre n'a rien à
  // y lire, et il n'a pas non plus à apprendre qu'elle existe.
  if (!soiree || soiree.guildId !== viewer.guildId) notFound();

  return (
    <SoireeView
      soiree={serializeSoiree(soiree, {
        isCurrent: soiree.id === current?.id,
        voterCount,
        currentSoireeId: current?.id ?? null,
      })}
      memberCount={memberCount}
      isAdmin={actor?.role === "ADMIN"}
      // L'heure du serveur, pour que le premier rendu du navigateur soit le même : la
      // page a une horloge (fermeture du vote, fenêtre de retrait) et prend le relais
      // ensuite.
      now={new Date().toISOString()}
      // Calculé ici, pas dans le rendu client : la même borne que `currentSoiree`, et
      // une seule horloge — celle du serveur.
      isPast={soiree.date < startOfToday()}
    />
  );
}
