import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getModById } from "@/lib/mock-data";
import { canDeleteMod } from "@/lib/mods/permissions";
import { modInclude } from "@/lib/mods/serialize";
import { toModView } from "@/lib/mods/view";
import { prisma } from "@/lib/prisma";
import { ModDetailView } from "./ModDetailView";

export default async function ModDetailPage(props: PageProps<"/mods/[id]">) {
  const { id } = await props.params;

  const session = await auth();
  if (!session?.user) redirect("/");

  const [record, actor] = await Promise.all([
    prisma.mod.findUnique({ where: { id }, include: modInclude }),
    // Pas de ligne User tant que le membre n'a rien créé : il n'est alors ni auteur
    // ni admin, et `canDeleteMod` répond non.
    prisma.user.findUnique({
      where: { discordId: session.user.id },
      select: { id: true, role: true },
    }),
  ]);

  // Les fiches de démonstration (catalogue, soirée, historique) vivent encore en dur ;
  // elles disparaîtront quand US-E1 branchera le catalogue sur GET /api/mods.
  const mod = record ? toModView(record) : getModById(id);

  // Seules les fiches en base sont éditables (US-B3) et supprimables (US-B4).
  return (
    <ModDetailView
      mod={mod}
      editHref={record ? `/mods/${id}/modifier` : undefined}
      canDelete={record ? canDeleteMod(actor, record) : false}
    />
  );
}
