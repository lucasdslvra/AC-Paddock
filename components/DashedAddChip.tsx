interface DashedAddChipProps {
  label: string;
}

export function DashedAddChip({ label }: DashedAddChipProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-[var(--color-border-dashed)] px-[9px] py-1 font-mono text-[10px] text-[var(--color-text-muted)]">
      {label}
    </span>
  );
}
