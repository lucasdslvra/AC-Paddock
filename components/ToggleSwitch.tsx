interface ToggleSwitchProps {
  on?: boolean;
  /**
   * Rend l'interrupteur actionnable : appelé avec l'état demandé. Sans lui, le
   * composant reste un simple témoin — l'espace admin s'en sert pour montrer des
   * réglages qu'il n'a pas encore de quoi modifier, et un bouton qui ne fait rien
   * quand on clique dessus est pire qu'un voyant.
   */
  onToggle?: (next: boolean) => void;
  /** Ce que l'interrupteur commande, pour les lecteurs d'écran. */
  label?: string;
}

export function ToggleSwitch({ on = true, onToggle, label }: ToggleSwitchProps) {
  const className = "flex h-[21px] w-[38px] items-center rounded-full px-[2px]";
  const style = {
    background: on ? "var(--color-amber)" : "var(--color-border-strong)",
    justifyContent: on ? "flex-end" : "flex-start",
  };
  const knob = <div className="h-[17px] w-[17px] rounded-full bg-[var(--color-ink)]" />;

  if (!onToggle) {
    return (
      <div className={className} style={style}>
        {knob}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
      className={className}
      style={style}
    >
      {knob}
    </button>
  );
}
