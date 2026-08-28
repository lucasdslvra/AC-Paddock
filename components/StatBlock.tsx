interface StatBlockProps {
  label: string;
  value: string | number;
  align?: "left" | "right";
  order?: "label-first" | "value-first";
  valueSize?: number;
}

export function StatBlock({
  label,
  value,
  align = "left",
  order = "label-first",
  valueSize = 22,
}: StatBlockProps) {
  const labelEl = (
    <div className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
      {label}
    </div>
  );
  const valueEl = (
    <div
      className="font-mono font-medium leading-none text-[var(--color-foreground)]"
      style={{ fontSize: valueSize }}
    >
      {value}
    </div>
  );

  return (
    <div className={align === "right" ? "text-right" : undefined}>
      {order === "value-first" ? (
        <>
          {valueEl}
          <div className="mt-1">{labelEl}</div>
        </>
      ) : (
        <>
          {labelEl}
          <div className="mt-1">{valueEl}</div>
        </>
      )}
    </div>
  );
}
