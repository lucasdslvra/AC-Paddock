"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

type NavKey = "catalogue" | "soiree" | "historique" | "admin";

const NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: "catalogue", label: "Catalogue", href: "/catalogue" },
  { key: "soiree", label: "Soirée en cours", href: "/soiree" },
  { key: "historique", label: "Historique", href: "/historique" },
  { key: "admin", label: "Admin", href: "/admin" },
];

interface AppHeaderProps {
  active?: NavKey | null;
  variant?: "default" | "admin";
  subtitle?: string;
  stats?: { label: string; value: string | number }[];
  cta?: { label: string; href: string };
}

export function AppHeader({ active = null, variant = "default", subtitle, stats, cta }: AppHeaderProps) {
  const { data: session } = useSession();

  const isAdmin = variant === "admin";

  return (
    <header
      className="flex items-center gap-5 border-b px-[22px] py-[14px]"
      style={
        isAdmin
          ? { background: "#17181c", color: "#fbfaf7", borderColor: "transparent" }
          : { background: "var(--color-surface)", borderColor: "var(--color-border)" }
      }
    >
      <div className="flex items-center gap-[11px]">
        <div
          className="flex h-[26px] w-[26px] items-center justify-center"
          style={{ background: isAdmin ? "var(--color-amber)" : "var(--color-emphasis-bg)" }}
        >
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: isAdmin ? "#17181c" : "var(--color-emphasis-icon)" }}
          >
            P
          </span>
        </div>
        <div>
          <div className="font-sans text-[17px] font-bold leading-none tracking-[-0.02em]">
            Paddock
          </div>
          {subtitle && (
            <div className="font-mono text-[9px] text-[var(--color-text-muted)]">{subtitle}</div>
          )}
        </div>
      </div>

      {isAdmin ? (
        <>
          <span className="font-mono text-[10px] tracking-[0.1em]" style={{ border: "1px solid rgba(255,255,255,.28)", padding: "3px 7px" }}>
            ESPACE ADMIN
          </span>
          <Link href="/catalogue" className="ml-2 font-sans text-xs font-medium text-[#9aa0a6] hover:text-[#fbfaf7]">
            Retour au catalogue
          </Link>
        </>
      ) : (
        <nav className="ml-[14px] flex gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="rounded-sm px-3 py-[6px] font-sans text-xs font-medium"
              style={
                active === item.key
                  ? { background: "var(--foreground)", color: "var(--background)" }
                  : { color: "var(--color-text-secondary)" }
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-4">
        {stats && stats.length > 0 && (
          <div
            className="flex gap-[14px] border-r pr-4"
            style={{ borderColor: isAdmin ? "rgba(255,255,255,.2)" : "var(--color-border)" }}
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="font-mono text-[10px] tracking-[0.08em]" style={{ color: isAdmin ? "#9aa0a6" : "var(--color-text-muted)" }}>
                  {stat.label}
                </div>
                <div className="font-mono text-[15px] font-medium">{stat.value}</div>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <span className="font-mono text-xs" style={{ color: "#c3c8cd" }}>
            {session?.user?.name ?? "…"} · admin
          </span>
        )}

        {!isAdmin && <ThemeToggle />}

        <UserMenu />

        {cta && !isAdmin && (
          <Link
            href={cta.href}
            className="rounded-sm px-[14px] py-2 font-sans text-xs font-semibold"
            style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </header>
  );
}
