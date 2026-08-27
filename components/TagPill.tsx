interface TagPillProps {
  label: string;
  active?: boolean;
  removable?: boolean;
  onClick?: () => void;
}

export function TagPill({ label, active = false, removable = false, onClick }: TagPillProps) {
  const Element = onClick ? "button" : "span";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1 rounded-full bg-[var(--color-ink)] px-2 py-1 font-mono text-[10px] text-[var(--color-surface)]"
          : "inline-flex items-center gap-1 rounded-full border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-secondary)]"
      }
    >
      {label}
      {removable && <span aria-hidden="true">✕</span>}
    </Element>
  );
}
