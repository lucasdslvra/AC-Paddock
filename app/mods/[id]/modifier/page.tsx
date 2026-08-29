import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ModForm } from "@/components/ModForm";
import { modInclude } from "@/lib/mods/serialize";
import { toUiModType } from "@/lib/mods/type";
import { prisma } from "@/lib/prisma";

export default async function ModifierModPage(props: PageProps<"/mods/[id]/modifier">) {
  const { id } = await props.params;

  const session = await auth();
  if (!session?.user) redirect("/");

  const mod = await prisma.mod.findUnique({ where: { id }, include: modInclude });
  // Les fiches de démonstration ne vivent qu'en dur dans lib/mock-data.ts : rien à éditer.
  if (!mod) notFound();

  return (
    <ModForm
      mod={{
        id: mod.id,
        type: toUiModType(mod.type),
        name: mod.name,
        url: mod.url,
        description: mod.description ?? "",
        imageUrl: mod.imageUrl,
        tags: mod.tags.map(({ tag }) => tag.name),
        author: mod.author.username,
      }}
    />
  );
}
