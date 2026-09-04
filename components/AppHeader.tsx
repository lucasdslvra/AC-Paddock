"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useIsAdmin } from "@/lib/admin/useIsAdmin";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

type NavKey = "catalogue" | "soiree" | "historique" | "admin";

/**
 * US-K1 — « Admin » porte `adminOnly` : la section n'est proposée qu'à ceux qui peuvent
 * y entrer, les autres n'ont aucune raison de la voir. Le lien masqué ne protège rien
 * — c'est le layout `/admin` qui refuse l'accès — il évite juste un onglet qui renvoie
 * tout le monde d'où il vient.
 */
const NAV_ITEMS: { key: NavKey; label: string; href: string; adminOnly?: boolean }[] = [
  { key: "catalogue", label: "Catalogue", href: "/catalogue" },
  { key: "soiree", label: "Soirée en cours", href: "/soiree" },
  { key: "historique", label: "Historique", href: "/historique" },
  { key: "admin", label: "Admin", href: "/admin", adminOnly: true },
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
  const isAdminMember = useIsAdmin();

  const isAdmin = variant === "admin";

  return (
    <header
      // Barre de navigation fixée en haut : elle porte les onglets, le compteur du
      // site et « Proposer un mod » — de quoi partir ailleurs, ce qui n'a aucune
      // raison de dépendre d'où l'on en est dans la page. `sticky` et non `fixed` :
      // l'en-tête garde sa place dans le flux, et rien en dessous n'a à compenser sa
      // hauteur. Le fond est opaque, sans quoi le contenu défilerait au travers.
      //
      // `flex-wrap` : sur un téléphone, les onglets passent à la ligne sous la marque
      // et les actions (voir `order-last` sur le <nav>). Tout tenir sur une seule ligne
      // demanderait de rogner soit les onglets, soit « Proposer un mod » — or c'est
      // précisément ce que l'en-tête est là pour offrir.
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-3 border-b px-4 py-3 sm:gap-x-5 sm:px-[22px] sm:py-[14px]"
      style={
        isAdmin
          ? { background: "#17181c", color: "#fbfaf7", borderColor: "transparent" }
          : { background: "var(--color-surface)", borderColor: "var(--color-border)" }
      }
    >
      <div className="flex flex-none items-center gap-[11px]">
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
          {/* Le bandeau « ESPACE ADMIN » est un rappel, pas une commande : sur un
              téléphone il céderait sa place au lien de sortie, qui, lui, sert. */}
          <span
            className="hidden font-mono text-[10px] tracking-[0.1em] sm:inline-block"
            style={{ border: "1px solid rgba(255,255,255,.28)", padding: "3px 7px" }}
          >
            ESPACE ADMIN
          </span>
          <Link
            href="/catalogue"
            className="font-sans text-xs font-medium whitespace-nowrap text-[#9aa0a6] hover:text-[#fbfaf7] sm:ml-2"
          >
            Retour au catalogue
          </Link>
        </>
      ) : (
        /* Les onglets passent en pleine largeur sous la marque tant que la fenêtre est
           étroite, et défilent à l'horizontale s'ils débordent : quatre sections en
           `text-xs` tiennent sur la plupart des téléphones, pas sur tous. Les marges
           négatives font courir la zone de défilement jusqu'aux bords de l'en-tête —
           sans elles, le dernier onglet resterait coincé sous le rembourrage. */
        <nav className="order-last -mx-4 w-full overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:order-none md:mx-0 md:ml-[14px] md:w-auto md:overflow-visible md:px-0">
          <div className="flex gap-1">
            {NAV_ITEMS.filter((item) => !item.adminOnly || isAdminMember).map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`flex-none rounded-sm px-3 py-[6px] font-sans text-xs font-medium whitespace-nowrap ${
                  active === item.key
                    ? "btn-solid"
                    : "btn-outline text-[var(--color-text-secondary)] hover:text-[var(--color-foreground)]"
                }`}
                // La couleur de l'onglet inactif passe par une classe, pas par `style` :
                // un `style` inline l'emporterait sur le survol.
                style={
                  active === item.key
                    ? {
                        background: "var(--color-emphasis-bg)",
                        color: "var(--color-emphasis-text)",
                      }
                    : undefined
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}

      <div className="ml-auto flex flex-none items-center gap-3 sm:gap-4">
        {/* Les compteurs du site sont une respiration, pas une commande : ils sortent
            les premiers quand la place manque. */}
        {stats && stats.length > 0 && (
          <div
            className="hidden gap-[14px] border-r pr-4 md:flex"
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
          <span className="hidden font-mono text-xs md:inline" style={{ color: "#c3c8cd" }}>
            {session?.user?.name ?? "…"} · admin
          </span>
        )}

        {!isAdmin && <ThemeToggle />}

        <UserMenu />

        {cta && !isAdmin && (
          <Link
            href={cta.href}
            className="btn-solid rounded-sm px-3 py-2 font-sans text-xs font-semibold whitespace-nowrap sm:px-[14px]"
            style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </header>
  );
}
