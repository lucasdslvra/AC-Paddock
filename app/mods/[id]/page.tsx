import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getModById } from "@/lib/mock-data";
import { canDeleteMod } from "@/lib/mods/permissions";
import { modInclude } from "@/lib/mods/serialize";
import { toModView } from "@/lib/mods/view";
import { prisma } from "@/lib/prisma";
import { ModDetailView } from "./ModDetailView";

export default async function ModDetailPage(props: PageProps<"/mods/[id]">) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);

  // US-D3 — le membre arrive du formulaire de création, pour vérifier si ce mod n'est
  // pas déjà celui qu'il s'apprêtait à proposer. Sa saisie l'attend dans l'onglet
  // (lib/mods/draft.ts) : la fiche lui propose d'y retourner.
  const hasPendingDraft = searchParams.brouillon === "1";

  const session = await auth();
  if (!session?.user) redirect("/");

  const [record, actor] = await Promise.all([
    prisma.mod.findUnique({ where: { id }, include: modInclude(session.user.id) }),
    // Pas de ligne User tant que le membre n'a rien créé : il n'est alors ni auteur
    // ni admin, et `canDeleteMod` répond non.
    prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { id: true, role: true },
    }),
  ]);

  // Le catalogue ne sert plus que de vraies fiches (US-E1), mais la soirée, l'historique
  // et l'admin vivent encore sur `lib/mock-data.ts` : un lien parti de ces pages tombe
  // sur un id qui n'existe pas en base. Ce repli disparaîtra avec les Epics F et G.
  const mod = record ? toModView(record) : getModById(id);

  // Seules les fiches en base sont éditables (US-B3) et supprimables (US-B4).
  return (
    <ModDetailView
      mod={mod}
      editHref={record ? `/mods/${id}/modifier` : undefined}
      canDelete={record ? canDeleteMod(actor, record) : false}
      hasPendingDraft={hasPendingDraft}
    />
  );
}
