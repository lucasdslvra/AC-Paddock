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
    /* Fixée en haut comme la barre de navigation (`AppHeader`) : sur une fiche longue
       ou un formulaire, c'est ici que vivent le fil d'Ariane et « Enregistrer ».

       Sur un téléphone, le fil passe à la ligne sous la marque (`order-last`) : les
       actions — « Annuler », « Enregistrer » — sont ce qu'on vient chercher ici, elles
       gardent la première ligne. La marque, elle, se réduit à son sigle : « Paddock »
       écrit en toutes lettres coûterait la moitié de la place des boutons. */
    <header className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:gap-x-5 sm:px-[22px] sm:py-[14px]">
      <div className="flex flex-none items-center gap-[11px]">
        <div className="flex h-[26px] w-[26px] items-center justify-center bg-[var(--color-emphasis-bg)]">
          <span className="font-mono text-[11px] font-semibold text-[var(--color-emphasis-icon)]">P</span>
        </div>
        <div className="hidden font-sans text-[17px] font-bold leading-none tracking-[-0.02em] sm:block">
          Paddock
        </div>
      </div>

      {/* Un nom de mod un peu long déborderait : le fil défile à l'horizontale plutôt
          que d'élargir la page — tronquer le dernier segment reviendrait à cacher
          justement là où l'on est. */}
      <div className="order-last -mx-4 flex w-full items-center gap-2 overflow-x-auto whitespace-nowrap px-4 font-mono text-[11px] text-[var(--color-text-muted)] [scrollbar-width:none] sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {crumbs.map((crumb, index) => (
          <span key={crumb.label} className="flex flex-none items-center gap-2">
            {index > 0 && <span>/</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="link-quiet">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-[var(--color-foreground)]">{crumb.label}</span>
            )}
          </span>
        ))}
      </div>

      <div className="ml-auto flex flex-none items-center gap-2 sm:gap-3">
        {actions}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
