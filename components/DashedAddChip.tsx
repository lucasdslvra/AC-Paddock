import Link from "next/link";

interface DashedAddChipProps {
  label: string;
  /** Rend le chip cliquable, vers une autre page. */
  href?: string;
  /**
   * Rend le chip cliquable sur place — il ouvre alors la retouche en ligne (US-B3).
   * Ignoré si `href` est fourni : un chip ne fait qu'une chose.
   */
  onClick?: () => void;
}

const CLASS_NAME =
  "inline-flex items-center rounded-full border border-dashed border-[var(--color-border-dashed)] px-[9px] py-1 font-mono text-[10px] text-[var(--color-text-muted)]";

export function DashedAddChip({ label, href, onClick }: DashedAddChipProps) {
  if (href) {
    return (
      <Link href={href} className={`${CLASS_NAME} btn-outline`}>
        {label}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${CLASS_NAME} btn-outline`}>
        {label}
      </button>
    );
  }

  return <span className={CLASS_NAME}>{label}</span>;
}
