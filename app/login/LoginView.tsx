"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { StatBlock } from "@/components/StatBlock";
import { siteStats } from "@/lib/mock-data";

const BULLETS = [
  "aucun mot de passe à retenir",
  "on récupère juste ton pseudo et ton avatar",
  "on vérifie que tu es sur le serveur du groupe",
];

export function LoginView() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-[22px] py-[14px]">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-[26px] w-[26px] items-center justify-center bg-[var(--color-ink)]">
            <span className="font-mono text-[11px] font-semibold text-[var(--color-amber)]">P</span>
          </div>
          <div className="font-sans text-[17px] font-bold leading-none tracking-[-0.02em]">
            Paddock
          </div>
        </div>
        <div className="font-mono text-[10px] tracking-[0.06em] text-[var(--color-text-muted)]">
          ACCÈS PRIVÉ · SERVEUR « LES BRISCARDS »
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 items-center gap-10 px-8 py-12 md:grid-cols-2 md:px-16">
        <div>
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            WIKI MODS ASSETTO CORSA
          </div>
          <h1 className="mt-3 text-pretty font-sans text-4xl font-bold leading-[1.02] tracking-[-0.035em] md:text-[46px]">
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
          <div className="mt-[26px] flex gap-[26px] border-t border-[var(--color-border)] pt-[18px]">
            <StatBlock label="FICHES" value={siteStats.fiches} />
            <StatBlock label="VOTES" value={siteStats.votes} />
            <StatBlock label="SOIRÉES" value={siteStats.soirees} />
          </div>
        </div>

        <div className="flex flex-col gap-[14px]">
          <div className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[26px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              CONNEXION
            </div>
            <div className="mt-2 font-sans text-xl font-semibold leading-[1.25]">
              Entre avec ton compte Discord
            </div>
            <button
              type="button"
              onClick={() => signIn("discord", { redirectTo: "/catalogue" })}
              className="mt-[18px] flex w-full items-center justify-center gap-[10px] rounded-[3px] p-[14px]"
              style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
            >
              <span className="h-4 w-4 rounded-sm" style={{ background: "var(--color-amber)" }} />
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

          {error && (
            <div
              className="rounded-sm border bg-[var(--color-surface)] p-4"
              style={{ borderColor: "var(--color-border-strong)", borderLeft: "3px solid var(--color-danger)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="px-[6px] py-[2px] font-mono text-[10px] tracking-[0.08em] text-white"
                  style={{ background: "var(--color-danger)" }}
                >
                  ÉTAT · ACCÈS REFUSÉ
                </span>
                <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  après retour OAuth
                </span>
              </div>
              <div className="mt-[10px] font-sans text-sm font-semibold leading-[1.4]">
                Tu n&apos;es pas membre du serveur « Les Briscards ».
              </div>
              <div className="mt-[6px] font-mono text-[11px] leading-[1.6] text-[var(--color-text-secondary)]">
                Demande une invitation à un admin, puis reconnecte-toi. Aucune session n&apos;a été
                créée.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => signIn("discord", { redirectTo: "/catalogue" })}
                  className="rounded-[3px] border border-[var(--color-border-strong)] px-3 py-[7px] font-sans text-[11px] font-medium"
                >
                  Réessayer
                </button>
                <a
                  href="https://discord.com"
                  className="rounded-[3px] px-3 py-[7px] font-sans text-[11px] font-medium text-[var(--color-text-secondary)]"
                  style={{ borderBottom: "1px solid var(--color-border-strong)" }}
                >
                  Contacter un admin
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
