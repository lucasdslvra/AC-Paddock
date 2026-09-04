/**
 * Cahier §2.2 — le lien externe d'une fiche est facultatif : on propose souvent un mod
 * de mémoire, et perdre la proposition entière pour un champ vide serait pire que la
 * fiche incomplète. Incomplète, elle l'est quand même — c'est ce que dit ce marqueur.
 *
 * Il n'accuse personne : n'importe quel membre peut poser le lien manquant (usage
 * wiki), et c'est précisément ce que l'infobulle rappelle. D'où l'ambre plutôt que le
 * rouge, qui est la couleur d'une erreur à corriger par celui qui l'a faite.
 *
 * L'infobulle est en CSS et non un `title` de navigateur : sur une carte du catalogue,
 * la seconde d'attente d'un `title` natif fait manquer le message à qui survole la
 * grille. Le texte reste lisible sans survol — lecteurs d'écran compris — grâce au
 * doublon en `sr-only`, le glyphe étant décoratif.
 */
export function MissingLinkBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`group relative inline-flex ${className}`} tabIndex={0}>
      <span
        aria-hidden="true"
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm text-[11px] leading-none"
        style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
      >
        ⚠
      </span>
      <span className="sr-only">Lien manquant sur cette fiche.</span>
      {/* `pointer-events-none` : l'infobulle ne doit pas s'interposer entre la souris
          et la carte, qui est cliquable sur toute sa surface. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[22px] z-10 w-[178px] rounded-sm px-[9px] py-[7px] text-left font-mono text-[10px] leading-[1.5] opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          background: "var(--color-emphasis-bg)",
          color: "var(--color-emphasis-text)",
        }}
      >
        Il manque le lien du mod — n&apos;importe quel membre peut l&apos;ajouter.
      </span>
    </span>
  );
}
