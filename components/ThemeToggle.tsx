"use client";

import { useTheme } from "@/lib/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Passer en thème clair" : "Passer en thème sombre"}
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="absolute h-[18px] w-[18px] text-[var(--color-foreground)] transition-all duration-300 ease-out"
        style={{
          opacity: isDark ? 0 : 1,
          transform: isDark ? "rotate(90deg) scale(0.4)" : "rotate(0deg) scale(1)",
        }}
      >
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M12 2.5v2.2" />
          <path d="M12 19.3v2.2" />
          <path d="M4.4 4.4l1.55 1.55" />
          <path d="M18.05 18.05l1.55 1.55" />
          <path d="M2.5 12h2.2" />
          <path d="M19.3 12h2.2" />
          <path d="M4.4 19.6l1.55-1.55" />
          <path d="M18.05 5.95l1.55-1.55" />
        </g>
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="absolute h-[18px] w-[18px] text-[var(--color-foreground)] transition-all duration-300 ease-out"
        style={{
          opacity: isDark ? 1 : 0,
          transform: isDark ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.4)",
        }}
      >
        <path
          d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
