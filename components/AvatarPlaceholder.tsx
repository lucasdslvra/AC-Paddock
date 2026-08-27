interface AvatarPlaceholderProps {
  size: number;
  variant?: "avatar" | "thumb";
  dimmed?: boolean;
  ring?: boolean;
}

export function AvatarPlaceholder({
  size,
  variant = "avatar",
  dimmed = false,
  ring = false,
}: AvatarPlaceholderProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: "none",
        opacity: dimmed ? 0.5 : 1,
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 4px, var(--color-placeholder-b) 4px 8px)",
        border: ring ? "2px solid var(--color-amber)" : undefined,
      }}
      className={variant === "avatar" ? "rounded-full" : "rounded-sm"}
    />
  );
}
