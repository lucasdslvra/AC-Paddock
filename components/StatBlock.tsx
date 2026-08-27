interface StatBlockProps {
  label: string;
  value: string | number;
  align?: "left" | "right";
}

export function StatBlock({ label, value, align = "left" }: StatBlockProps) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="font-mono text-xl leading-none text-[var(--color-foreground)] mt-1">
        {value}
      </div>
    </div>
  );
}
