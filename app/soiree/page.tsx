import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { soireeContext } from "@/lib/soirees/current";
import { isVoteOpen } from "@/lib/soirees/phase";
import { serializeSoiree, soireeInclude } from "@/lib/soirees/serialize";
import { drawTieBreaks } from "@/lib/soirees/tie-break";
import { countSoireeVoters } from "@/lib/soirees/vote";
import { SoireeView } from "./SoireeView";

/**
 * US-G2 / US-G4 — « Soirée en cours » : les mods engagés, leur classement, et de quoi
 * en engager d'autres.
 *
 * Page serveur, comme la fiche détail : le classement est déjà trié par la base, il
 * n'y a aucune raison de le faire redescendre en deux temps. `SoireeView` reprend
 * ensuite la main pour les votes et les engagements, qui sont des écritures.
 */
export default async function SoireePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  // La soirée en cours du serveur de ce membre — chaque groupe a la sienne.
  const viewer = await soireeContext(session);
  const current = viewer.current;

  if (!current) {
    return <SoireeView soiree={null} memberCount={0} />;
  }

  // Le vote de la soirée en cours vient peut-être de fermer : c'est alors cette lecture
  // qui tire au sort ses ex æquo, avant de lire le classement qu'elle affiche.
  //
  // `drawTieBreaks` se garde tout seul, mais la question se tranche ici sans requête, et
  // c'est la page que le groupe recharge le plus pendant que le vote est ouvert — la
  // seule où l'appel serait, presque à chaque fois, une écriture pour rien.
  if (!isVoteOpen(current.date)) {
    await drawTieBreaks({ soireeId: current.id, guildId: viewer.guildId });
  }

  const [soiree, voterCount, memberCount, actor] = await Promise.all([
    prisma.soiree.findUnique({
      where: { id: current.id },
      include: soireeInclude(session.user.id, viewer),
    }),
    countSoireeVoters(current.id),
    // Le dénominateur de « 5 / 8 ont voté » : les membres de ce serveur que la base
    // connaît, c'est-à-dire ceux qui s'y sont déjà connectés. Le serveur Discord en
    // compte sans doute plus, mais l'application ne les a jamais vus.
    prisma.user.count({ where: { guildId: viewer.guildId } }),
    // Le rôle n'est pas dans la session : on le relit en base. Il ne sert ici qu'à
    // afficher le bouton « retirer » sur les engagements des autres — la route le
    // revérifie avant d'écrire.
    prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { role: true },
    }),
  ]);

  // La soirée a disparu entre les deux requêtes — improbable, mais elle est résolue
  // à part.
  if (!soiree) {
    return <SoireeView soiree={null} memberCount={memberCount} />;
  }

  return (
    <SoireeView
      soiree={serializeSoiree(soiree, {
        isCurrent: true,
        voterCount,
        currentSoireeId: current.id,
      })}
      memberCount={memberCount}
      isAdmin={actor?.role === "ADMIN"}
      // L'heure du serveur, pour que le premier rendu du navigateur soit le même : la
      // page a une horloge (fermeture du vote, fenêtre de retrait) et prend le relais
      // ensuite.
      now={new Date().toISOString()}
    />
  );
}
