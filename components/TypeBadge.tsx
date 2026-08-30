import type { ModType } from "@/lib/mock-data";

const TYPE_LABELS: Record<ModType, string> = {
  vehicule: "VÉHICULE",
  circuit: "CIRCUIT",
};

interface TypeBadgeProps {
  type: ModType;
  as?: "pill" | "label";
}

export function TypeBadge({ type, as = "label" }: TypeBadgeProps) {
  const label = TYPE_LABELS[type];

  if (as === "pill") {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-emphasis-bg)] px-[7px] py-[3px] font-mono text-[10px] tracking-[0.08em] text-[var(--color-emphasis-text)]">
        {label}
      </span>
    );
  }

  return (
    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-muted)]">
      {label}
    </span>
  );
}
