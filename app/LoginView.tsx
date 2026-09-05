"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { StatBlock } from "@/components/StatBlock";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { SiteStats } from "@/lib/stats";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";

const BULLETS = [
  "aucun mot de passe à retenir",
  "on récupère juste ton pseudo et ton avatar",
  "on vérifie que tu es sur le serveur du groupe",
];

interface LoginViewProps {
  guildName: string | null;
  /** Comptés en base par la page (`app/page.tsx`), `null` si elle n'a pas répondu. */
  stats: SiteStats | null;
}

interface ErrorCopy {
  badge: string;
  title: string;
  detail: string;
  showContactAdmin: boolean;
}

function getErrorCopy(code: string, serverLabel: string): ErrorCopy {
  switch (code) {
    case AUTH_ERROR_CODES.notGuildMember:
    // Auth.js raises its own AccessDenied if a refusal ever bypasses our codes.
    case "AccessDenied":
      return {
        badge: "ÉTAT · ACCÈS REFUSÉ",
        title: `Tu n'es pas membre du serveur ${serverLabel}.`,
        detail:
          "Demande une invitation à un admin, puis reconnecte-toi. Aucune session n'a été créée.",
        showContactAdmin: true,
      };
    case AUTH_ERROR_CODES.checkFailed:
      return {
        badge: "ÉTAT · VÉRIFICATION IMPOSSIBLE",
        title: "Impossible de vérifier ton appartenance au serveur.",
        detail:
          "Discord n'a pas répondu. Réessaie dans un instant — ton accès n'est pas remis en cause.",
        showContactAdmin: false,
      };
    case "Configuration":
      return {
        badge: "ÉTAT · CONFIGURATION",
        title: "La connexion Discord est mal configurée.",
        detail: "Préviens un admin : les identifiants Discord de l'app doivent être vérifiés.",
        showContactAdmin: true,
      };
    default:
      return {
        badge: "ÉTAT · ÉCHEC DE CONNEXION",
        title: "Un problème est survenu pendant la connexion.",
        detail: "Réessaie dans un instant. Si le problème persiste, préviens un admin.",
        showContactAdmin: false,
      };
  }
}

export function LoginView({ guildName, stats }: LoginViewProps) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const serverLabel = guildName ? `« ${guildName} »` : "autorisé";
  const errorCopy = error ? getErrorCopy(error, serverLabel) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="page-shell-inset flex items-center justify-between border-b border-[var(--color-border)] py-3 [--shell-gutter:16px] sm:py-[14px] sm:[--shell-gutter:22px]">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-[26px] w-[26px] items-center justify-center bg-[var(--color-emphasis-bg)]">
            <span className="font-mono text-[11px] font-semibold text-[var(--color-emphasis-icon)]">P</span>
          </div>
          <div className="font-sans text-[17px] font-bold leading-none tracking-[-0.02em]">
            Paddock
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="page-shell grid flex-1 grid-cols-1 items-center gap-10 px-5 py-10 sm:px-8 sm:py-12 md:grid-cols-2 md:px-16">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            WIKI MODS ASSETTO CORSA
          </div>
          <h1 className="mt-3 text-pretty font-sans text-[32px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl sm:leading-[1.02] md:text-[46px]">
            On arrête de
            <br />
            chercher le lien
            <br />
            dans le Discord.
          </h1>
          <p className="mt-[18px] max-w-[400px] text-pretty font-sans text-sm leading-[1.6] text-[var(--color-text-secondary)]">
            Une fiche par mod, complétée par tout le monde. Tu proposes, on vote, et vendredi soir
            on sait déjà ce qu&apos;on installe.
          </p>
          <div className="mt-[26px] flex flex-wrap gap-x-[26px] gap-y-4 border-t border-[var(--color-border)] pt-[18px]">
            <StatBlock label="MODS" value={stats?.mods ?? "—"} order="value-first" />
            <StatBlock label="VOTES" value={stats?.votes ?? "—"} order="value-first" />
            <StatBlock label="SOIRÉES" value={stats?.soirees ?? "—"} order="value-first" />
          </div>
        </div>

        <div className="flex flex-col gap-[14px]">
          <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-[26px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              CONNEXION
            </div>
            <div className="mt-2 font-sans text-xl font-semibold leading-[1.25]">
              Entre avec ton compte Discord
            </div>
            <button
              type="button"
              onClick={() => signIn("discord", { redirectTo: "/catalogue" })}
              className="btn-solid mt-[18px] flex w-full items-center justify-center gap-[10px] rounded-[3px] p-[14px]"
              style={{ background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }}
            >
              <span className="h-4 w-4 rounded-sm" style={{ background: "var(--color-emphasis-icon)" }} />
              <span className="font-sans text-sm font-semibold">Se connecter avec Discord</span>
            </button>
            <div className="mt-4 flex flex-col gap-[7px] border-t border-[var(--color-border-hairline)] pt-[14px]">
              {BULLETS.map((bullet) => (
                <div key={bullet} className="flex gap-2 font-mono text-[11px] leading-[1.5] text-[var(--color-text-secondary)]">
                  <span className="text-[var(--color-link)]">▸</span>
                  {bullet}
                </div>
              ))}
            </div>
          </div>

          {errorCopy && (
            <div
              className="rounded-sm border bg-[var(--color-surface)] p-4"
              style={{ borderColor: "var(--color-border-strong)", borderLeft: "3px solid var(--color-danger)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="px-[6px] py-[2px] font-mono text-[10px] tracking-[0.08em] text-white"
                  style={{ background: "var(--color-danger)" }}
                >
                  {errorCopy.badge}
                </span>
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  après retour OAuth
                </span>
              </div>
              <div className="mt-[10px] font-sans text-sm font-semibold leading-[1.4]">
                {errorCopy.title}
              </div>
              <div className="mt-[6px] font-mono text-[11px] leading-[1.6] text-[var(--color-text-secondary)]">
                {errorCopy.detail}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => signIn("discord", { redirectTo: "/catalogue" })}
                  className="btn-outline rounded-[3px] border border-[var(--color-border-strong)] px-3 py-[7px] font-sans text-[11px] font-medium"
                >
                  Réessayer
                </button>
                {errorCopy.showContactAdmin && (
                  <a
                    href="https://discord.com"
                    className="link-underline rounded-[3px] px-3 py-[7px] font-sans text-[11px] font-medium text-[var(--color-text-secondary)]"
                    style={{ borderBottom: "1px solid var(--color-border-strong)" }}
                  >
                    Contacter un admin
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
