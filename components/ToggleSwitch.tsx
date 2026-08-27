interface ToggleSwitchProps {
  on?: boolean;
}

export function ToggleSwitch({ on = true }: ToggleSwitchProps) {
  return (
    <div
      className="flex h-[21px] w-[38px] items-center rounded-full px-[2px]"
      style={{
        background: on ? "var(--color-amber)" : "var(--color-border-strong)",
        justifyContent: on ? "flex-end" : "flex-start",
      }}
    >
      <div className="h-[17px] w-[17px] rounded-full bg-[var(--color-ink)]" />
    </div>
  );
}
