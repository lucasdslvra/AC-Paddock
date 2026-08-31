import { ModForm } from "@/components/ModForm";
import { currentSoiree } from "@/lib/soirees/current";
import { formatSoireeShortDay } from "@/lib/soirees/format";

export default async function NouveauModPage() {
  // US-G2 — proposer une fiche et l'engager dans la foulée. La soirée est lue ici
  // plutôt que dans le formulaire : c'est un composant client, et la seule chose qu'il
  // en affiche (la date, le thème) est déjà connue au rendu de la page.
  const soiree = await currentSoiree();

  return (
    <ModForm
      currentSoiree={
        soiree
          ? { dateLabel: formatSoireeShortDay(soiree.date), theme: soiree.name }
          : null
      }
    />
  );
}
