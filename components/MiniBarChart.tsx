interface MiniBarChartProps {
  values: number[];
  height?: number;
  dimmed?: boolean;
}

export function MiniBarChart({ values, height = 20, dimmed = false }: MiniBarChartProps) {
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {values.map((value, index) => (
        <div
          key={index}
          className="flex-1"
          style={{
            height: `${value}%`,
            background: dimmed ? "var(--color-bar-dimmed)" : "var(--color-amber)",
          }}
        />
      ))}
    </div>
  );
}
