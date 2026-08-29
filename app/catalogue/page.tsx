import { Suspense } from "react";
import { CatalogueView } from "./CatalogueView";

/**
 * Le filtre par tags vit dans les query params de l'URL (US-C2), que `CatalogueView`
 * lit avec `useSearchParams`. Ce hook force le rendu côté client de tout ce qui se
 * trouve sous lui : la frontière `Suspense` est ce qui délimite cette zone, et sans
 * elle Next.js refuserait le prérendu de la page entière.
 */
export default function CataloguePage() {
  return (
    <Suspense fallback={<p className="p-8">Chargement…</p>}>
      <CatalogueView />
    </Suspense>
  );
}
