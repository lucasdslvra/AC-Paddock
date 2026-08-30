"use client";

/**
 * US-J1 — la barre de filtres combinée : ce qui restreint la liste, écrit en toutes
 * lettres au-dessus d'elle.
 *
 * Les commandes elles-mêmes restent dans la colonne de gauche (champ de recherche,
 * types, pastilles de tags) : cette barre ne les double pas, elle répond à la seule
 * question que la colonne pose mal — « pourquoi cette liste-là ? ». Un type coché en
 * haut du panneau, un tag coché en bas et une recherche tapée entre les deux forment un
 * ET dont aucun écran ne montrait le résultat d'un seul regard.
 *
 * Chaque critère se retire d'un clic sur sa puce, et le lot entier d'un clic sur
 * « tout réinitialiser » — le second critère d'acceptation de l'US.
 */

/** Un critère actif, tel qu'il s'affiche et se retire. */
export interface ActiveFilter {
  /** Identifiant stable dans la liste — `type`, `search`, ou `tag:<nom>`. */
  key: string;
  /** Ce que le critère restreint : « type », « tag », « nom ». */
  kind: string;
  /** La valeur retenue, dans les mots de l'interface. */
  label: string;
  onRemove: () => void;
}

interface ActiveFilterBarProps {
  filters: ActiveFilter[];
  onReset: () => void;
}

export function ActiveFilterBar({ filters, onReset }: ActiveFilterBarProps) {
  // Sans filtre, pas de barre : une ligne « aucun filtre actif » occuperait de la place
  // pour ne rien dire, et ferait sauter la grille d'un cran au premier clic.
  if (filters.length === 0) return null;

  return (
    <div className="mb-[14px] flex flex-wrap items-center gap-[6px] rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] px-[10px] py-2">
      <span className="mr-1 font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        FILTRES ACTIFS
      </span>

      {filters.map((filter, index) => (
        <div key={filter.key} className="flex items-center gap-[6px]">
          {/* Le ET du cahier §2.3, écrit tel quel : deux puces côte à côte se lisent
              aussi bien comme un OU tant que rien ne les relie. */}
          {index > 0 && (
            <span className="font-mono text-[10px] text-[var(--color-text-faint)]">ET</span>
          )}
          <button
            type="button"
            onClick={filter.onRemove}
            aria-label={`Retirer le filtre ${filter.kind} : ${filter.label}`}
            className="btn-outline inline-flex items-center gap-[6px] rounded-full border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-secondary)]"
          >
            <span className="text-[var(--color-text-faint)]">{filter.kind} :</span>
            <span className="text-[var(--color-foreground)]">{filter.label}</span>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onReset}
        className="link-underline ml-auto border-b font-sans text-[11px] font-medium text-[var(--color-link)]"
        style={{ borderColor: "var(--color-amber)" }}
      >
        tout réinitialiser
      </button>
    </div>
  );
}
