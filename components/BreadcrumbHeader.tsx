"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbHeaderProps {
  crumbs: Crumb[];
  actions?: ReactNode;
}

export function BreadcrumbHeader({ crumbs, actions }: BreadcrumbHeaderProps) {
  return (
    <header className="flex items-center gap-5 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[22px] py-[14px]">
      <div className="flex items-center gap-[11px]">
        <div className="flex h-[26px] w-[26px] items-center justify-center bg-[var(--color-emphasis-bg)]">
          <span className="font-mono text-[11px] font-semibold text-[var(--color-emphasis-icon)]">P</span>
        </div>
        <div className="font-sans text-[17px] font-bold leading-none tracking-[-0.02em]">Paddock</div>
      </div>

      <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--color-text-muted)]">
        {crumbs.map((crumb, index) => (
          <span key={crumb.label} className="flex items-center gap-2">
            {index > 0 && <span>/</span>}
            {crumb.href ? (
              <Link href={crumb.href}>{crumb.label}</Link>
            ) : (
              <span className="text-[var(--color-foreground)]">{crumb.label}</span>
            )}
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {actions}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
