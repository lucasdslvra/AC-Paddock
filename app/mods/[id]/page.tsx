import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getModById } from "@/lib/mock-data";
import { toModView } from "@/lib/mods/view";
import { prisma } from "@/lib/prisma";
import { ModDetailView } from "./ModDetailView";

export default async function ModDetailPage(props: PageProps<"/mods/[id]">) {
  const { id } = await props.params;

  const session = await auth();
  if (!session?.user) redirect("/");

  const record = await prisma.mod.findUnique({ where: { id }, include: { author: true } });

  // Les fiches de démonstration (catalogue, soirée, historique) vivent encore en dur ;
  // elles disparaîtront quand US-E1 branchera le catalogue sur GET /api/mods.
  const mod = record ? toModView(record) : getModById(id);

  return <ModDetailView mod={mod} />;
}
