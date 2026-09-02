import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { maxModFileBytes } from "@/lib/admin/config";
import { getModById } from "@/lib/mock-data";
import { listModContributions } from "@/lib/mods/contributions";
import { listModPlayedAt } from "@/lib/mods/played";
import { canDeleteMod } from "@/lib/mods/permissions";
import { modInclude } from "@/lib/mods/serialize";
import { toModView } from "@/lib/mods/view";
import { prisma } from "@/lib/prisma";
import { soireeContext } from "@/lib/soirees/current";
import { formatSoireeShortDay } from "@/lib/soirees/format";
import { isVoteOpen, voteClosedMessage } from "@/lib/soirees/phase";
import { ModDetailView } from "./ModDetailView";

export default async function ModDetailPage(props: PageProps<"/mods/[id]">) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);

  // US-D3 — le membre arrive du formulaire de création, pour vérifier si ce mod n'est
  // pas déjà celui qu'il s'apprêtait à proposer. Sa saisie l'attend dans l'onglet
  // (lib/mods/draft.ts) : la fiche lui propose d'y retourner.
  const hasPendingDraft = searchParams.brouillon === "1";

  const session = await auth();
  if (!session?.user) redirect("/");

  // US-G3 — c'est la soirée en cours du serveur de ce membre qui décide si cette fiche
  // est votable, et le panneau de vote doit pouvoir dire *pourquoi* elle ne l'est pas.
  const viewer = await soireeContext(session);
  const soiree = viewer.current;

  const [record, actor, contributions, playedAt, maxFileBytes] = await Promise.all([
    prisma.mod.findUnique({ where: { id }, include: modInclude(session.user.id, viewer) }),
    // Pas de ligne User tant que le membre n'a rien créé : il n'est alors ni auteur
    // ni admin, et `canDeleteMod` répond non.
    prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { id: true, role: true },
    }),
    // Cahier §2.2 et §2.5 — qui a corrigé la fiche, et où elle a déjà tourné. Deux
    // lectures à part de `modInclude` : le catalogue affiche des dizaines de fiches à
    // la fois et n'a besoin ni de l'une ni de l'autre. Lancées avec la fiche plutôt
    // qu'après elle — elles ne dépendent que de son identifiant, et rendent une réponse
    // vide si elle n'existe pas.
    listModContributions(id),
    listModPlayedAt(id, viewer.guildId),
    // US-H1/US-K3 — le plafond d'upload que la fiche affiche et fait respecter côté
    // navigateur. Lu ici pour descendre avec le rendu : le panneau doit pouvoir
    // annoncer la limite avant qu'on lui donne un fichier.
    maxModFileBytes(),
  ]);

  // Le catalogue, la soirée et l'historique ne servent plus que de vraies fiches ; seul
  // l'espace admin vit encore sur `lib/mock-data.ts` : un lien parti de ses tableaux
  // tombe sur un id qui n'existe pas en base. Ce repli disparaîtra avec l'Epic J.
  const mod = record ? toModView(record, soiree?.id ?? null) : getModById(id);

  // Une fiche de démonstration n'a rien en base : son fil et ses soirées sont ceux
  // qu'elle porte en dur.
  const feed = record
    ? contributions
    : { entries: mod?.contributions ?? [], total: mod?.contributions?.length ?? 0, olderCount: 0 };
  const played = record ? playedAt : { entries: mod?.playedAt ?? [], olderCount: 0 };

  // Seules les fiches en base sont éditables (US-B3) et supprimables (US-B4).
  return (
    <ModDetailView
      mod={mod}
      editHref={record ? `/mods/${id}/modifier` : undefined}
      canDelete={record ? canDeleteMod(actor, record) : false}
      hasPendingDraft={hasPendingDraft}
      contributions={feed}
      playedAt={played}
      currentSoiree={
        soiree
          ? {
              id: soiree.id,
              dateLabel: formatSoireeShortDay(soiree.date),
              // Le vote ferme 30 min avant le départ : la fiche éteint alors son bouton
              // plutôt que d'envoyer un vote que la route refusera. Calculé au rendu,
              // donc juste au chargement — un onglet resté ouvert depuis la veille se
              // fait reprendre par le serveur, avec la même phrase.
              voteClosedReason: isVoteOpen(soiree.date) ? null : voteClosedMessage(soiree.date),
            }
          : null
      }
      maxModFileBytes={maxFileBytes}
    />
  );
}
