import Link from "next/link";

interface TagPillProps {
  label: string;
  active?: boolean;
  removable?: boolean;
  onClick?: () => void;
  /**
   * Rend la pastille cliquable vers une URL — typiquement le catalogue filtré sur ce
   * tag (US-C2). Ignoré si `onClick` est fourni : une pastille agit, ou elle navigue.
   */
  href?: string;
}

const ACTIVE_CLASS_NAME =
  "inline-flex items-center gap-1 rounded-full bg-[var(--color-emphasis-bg)] px-2 py-1 font-mono text-[10px] text-[var(--color-emphasis-text)]";

const IDLE_CLASS_NAME =
  "inline-flex items-center gap-1 rounded-full border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-secondary)]";

export function TagPill({ label, active = false, removable = false, onClick, href }: TagPillProps) {
  const className = active ? ACTIVE_CLASS_NAME : IDLE_CLASS_NAME;
  const content = (
    <>
      {label}
      {removable && <span aria-hidden="true">✕</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <span className={className}>{content}</span>;
}
