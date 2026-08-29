import Link from "next/link";

interface DashedAddChipProps {
  label: string;
  /** Rend le chip cliquable. Absent, il reste un simple repère visuel. */
  href?: string;
}

const CLASS_NAME =
  "inline-flex items-center rounded-full border border-dashed border-[var(--color-border-dashed)] px-[9px] py-1 font-mono text-[10px] text-[var(--color-text-muted)]";

export function DashedAddChip({ label, href }: DashedAddChipProps) {
  if (href) {
    return (
      <Link href={href} className={CLASS_NAME}>
        {label}
      </Link>
    );
  }

  return <span className={CLASS_NAME}>{label}</span>;
}
