import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ModForm } from "@/components/ModForm";
import { currentSoiree } from "@/lib/soirees/current";
import { formatSoireeShortDay } from "@/lib/soirees/format";

export default async function NouveauModPage() {
  // Comme les autres pages de fiche : la session est lue ici, et sa lecture rend la
  // page dynamique. Sans elle, Next.js prérendrait la soirée ci-dessous au build et
  // servirait la même jusqu'au déploiement suivant.
  const session = await auth();
  if (!session?.user) redirect("/");

  // US-G2 — proposer une fiche et l'engager dans la foulée. La soirée est lue ici
  // plutôt que dans le formulaire : c'est un composant client, et la seule chose qu'il
  // en affiche (la date, le thème) est déjà connue au rendu de la page.
  const soiree = await currentSoiree();

  return (
    <ModForm
      currentSoiree={
        soiree ? { dateLabel: formatSoireeShortDay(soiree.date), theme: soiree.name } : null
      }
    />
  );
}
