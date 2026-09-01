import { Suspense } from "react";
import { fetchGuildWidgetName } from "@/lib/discord/widget";
import { countSiteStats, type SiteStats } from "@/lib/stats";
import { LoginView } from "./LoginView";

/**
 * Les compteurs sont rendus ici, côté serveur : la page d'accueil s'adresse à des
 * visiteurs non connectés, qui n'ont accès à aucune route de l'API.
 *
 * Une base injoignable ne doit pas emporter la page : c'est la seule porte d'entrée
 * du site, et on y vient pour se connecter, pas pour lire trois nombres. Ils passent
 * alors à `null`, et l'accroche affiche un tiret.
 */
async function readSiteStats(): Promise<SiteStats | null> {
  try {
    return await countSiteStats();
  } catch (error) {
    console.error("GET / — compteurs", error);
    return null;
  }
}

/**
 * La page est prérendue (aucune API de requête n'y est lue) : sans cette ligne, les
 * compteurs seraient figés à ce qu'ils valaient au `build`. Cinq minutes suffisent —
 * c'est une accroche, pas un tableau de bord, et la page d'accueil est celle qui prend
 * tout le trafic anonyme : on ne veut pas trois `count` par visite.
 */
export const revalidate = 300;

export default async function Home() {
  const [guildName, stats] = await Promise.all([fetchGuildWidgetName(), readSiteStats()]);

  return (
    <Suspense fallback={null}>
      <LoginView guildName={guildName} stats={stats} />
    </Suspense>
  );
}
