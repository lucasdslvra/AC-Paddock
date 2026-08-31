/**
 * L'attente, au centre de la page.
 *
 * Un « Chargement… » posé en haut à gauche se lisait comme un reste de page cassée :
 * rien d'autre à l'écran, et le seul mot visible collé dans un coin. L'anneau ambre est
 * le même repère que celui des boutons primaires, et il est là où l'œil attend le
 * contenu qui arrive.
 *
 * Le mot reste, pour les lecteurs d'écran (`sr-only`) : une animation ne s'annonce pas.
 */
interface PageLoaderProps {
  /** Ce qu'on attend, quand la page peut le dire (« la soirée », « la fiche »). */
  label?: string;
  /** Faux quand le loader remplit une zone et non la page entière (formulaire). */
  fullScreen?: boolean;
}

export function PageLoader({ label = "Chargement…", fullScreen = true }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex flex-1 flex-col items-center justify-center gap-4 p-8 ${
        fullScreen ? "min-h-screen" : "min-h-[320px]"
      }`}
    >
      <span className="loader-ring" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
