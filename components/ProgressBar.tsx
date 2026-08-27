interface ProgressBarProps {
  percent: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
}

export function ProgressBar({
  percent,
  height = 4,
  trackColor = "var(--color-track)",
  fillColor = "var(--color-amber)",
}: ProgressBarProps) {
  return (
    <div style={{ height, background: trackColor }}>
      <div style={{ width: `${Math.min(100, Math.max(0, percent))}%`, height, background: fillColor }} />
    </div>
  );
}
