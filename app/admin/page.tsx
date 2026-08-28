"use client";

import { AppHeader } from "@/components/AppHeader";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { admin, mods, tags } from "@/lib/mock-data";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function AdminPage() {
  const { session, isLoading } = useRequireAuth();

  if (isLoading) {
    return <p className="p-8">Chargement…</p>;
  }

  const sliderPercent =
    ((admin.settings.maxUploadMo - admin.settings.minUploadMo) /
      (admin.settings.maxUploadMoCeiling - admin.settings.minUploadMo)) *
    100;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader variant="admin" />

      <div className="grid grid-cols-1 gap-[18px] p-5 lg:grid-cols-[1fr_330px]">
        <div className="flex flex-col gap-[14px]">
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-[18px] py-[15px]">
              <div>
                <div className="font-sans text-[15px] font-semibold">Modération du catalogue</div>
                <div className="mt-[2px] font-mono text-[9.5px] text-[var(--color-text-muted)]">
                  {mods.length} fiches · {tags.length} tags · suppression possible sur tout contenu
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-sm border border-[var(--color-border-strong)] px-[10px] py-[7px]">
                <span className="font-mono text-[10px] text-[var(--color-text-faint)]">⌕</span>
                <span className="font-mono text-[11px] text-[var(--color-text-faint)]">filtrer</span>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_110px_92px_78px_104px] gap-[14px] border-b border-[var(--color-border-hairline)] px-[18px] py-[9px] font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              <span>FICHE</span>
              <span>AUTEUR</span>
              <span>CRÉÉE</span>
              <span>VOTES</span>
              <span className="text-right">ACTION</span>
            </div>
            {admin.modsTable.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[1fr_110px_92px_78px_104px] items-center gap-[14px] border-b border-[var(--color-border-hairline)] px-[18px] py-[11px] last:border-b-0"
                style={{ background: row.danger ? "rgba(255,255,255,.5)" : undefined }}
              >
                <div className="flex items-center gap-[10px]">
                  <div
                    className="h-7 w-7 flex-none rounded-sm"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(135deg, var(--color-placeholder-a) 0 4px, var(--color-placeholder-b) 4px 8px)",
                    }}
                  />
                  <div>
                    <span className="font-sans text-[13px] font-medium">{row.name}</span>
                    {row.subtitle && (
                      <div className="font-mono text-[10px]" style={{ color: "var(--color-danger-text)" }}>
                        {row.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[10.5px] text-[var(--color-text-secondary)]">{row.author}</span>
                <span className="font-mono text-[10.5px] text-[var(--color-text-muted)]">{row.dateLabel}</span>
                <span className="font-mono text-xs">{row.votes}</span>
                <span
                  className="justify-self-end rounded-sm px-[10px] py-[6px] font-sans text-[11px] font-medium"
                  style={
                    row.danger
                      ? { background: "var(--color-danger)", color: "#fff" }
                      : { border: "1px solid var(--color-border-strong)" }
                  }
                >
                  Supprimer
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-[15px] px-[18px]">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              JOURNAL DES SUPPRESSIONS
            </div>
            <div className="mt-[11px] flex flex-col gap-[6px] font-mono text-[10.5px] text-[var(--color-text-secondary)]">
              {admin.deletionsLog.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <div className="text-[var(--color-text-muted)]">— {admin.olderLogCount} entrées plus anciennes</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">RÉGLAGES</div>
            <div className="mt-[13px]">
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs font-medium">Taille max d&apos;un upload</span>
                <span className="font-mono text-[13px] font-medium">{admin.settings.maxUploadMo} Mo</span>
              </div>
              <div className="relative mt-2 h-1" style={{ background: "var(--color-border-strong)" }}>
                <div className="h-1" style={{ width: `${sliderPercent}%`, background: "var(--color-ink)" }} />
                <div
                  className="absolute -top-1 h-3 w-3 rounded-full"
                  style={{
                    left: `calc(${sliderPercent}% - 6px)`,
                    background: "var(--color-amber)",
                    border: "1px solid var(--color-ink)",
                  }}
                />
              </div>
              <div className="mt-[5px] flex justify-between font-mono text-[10px] text-[var(--color-text-faint)]">
                <span>{admin.settings.minUploadMo} Mo</span>
                <span>{admin.settings.maxUploadMoCeiling} Mo</span>
              </div>
              <div className="mt-[7px] font-mono text-[10px] leading-[1.6] text-[var(--color-text-secondary)]">
                S&apos;applique aux prochains uploads, sans redéploiement.
              </div>
            </div>
            <div className="mt-4 border-t border-[var(--color-border-hairline)] pt-[14px]">
              <div className="font-sans text-xs font-medium">Rétention des fichiers</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-mono text-[15px]">{admin.settings.retentionHours} h</span>
                <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
                  après l&apos;upload · non modifiable
                </span>
              </div>
              <div className="mt-[9px] flex items-center justify-between rounded-sm bg-[var(--color-border-hairline)] px-[11px] py-[9px]">
                <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
                  dernier nettoyage : {admin.settings.lastCleanupLabel}
                </span>
                <span className="px-[6px] py-[2px] font-mono text-[10px]" style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}>
                  OK
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">ACCÈS</div>
            <div className="mt-3">
              <div className="font-sans text-xs font-medium">Serveur Discord autorisé</div>
              <div className="mt-[7px] rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[9px] font-mono text-[11px] text-[var(--color-text-secondary)]">
                {session?.guildName ?? admin.access.guildName} · {admin.access.guildIdMasked}
              </div>
              <div className="mt-[7px] font-mono text-[10px] leading-[1.6] text-[var(--color-text-secondary)]">
                Vérifié à chaque connexion. Quitter le serveur coupe l&apos;accès à la session
                suivante.
              </div>
            </div>
            <div className="mt-[14px] flex flex-col gap-2 border-t border-[var(--color-border-hairline)] pt-[14px]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-sans text-xs font-medium">Notifier sur Discord</div>
                  <div className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
                    nouvelle soirée + nouveau mod
                  </div>
                </div>
                <ToggleSwitch on={admin.access.notifyDiscord} />
              </div>
              <div className="rounded-sm bg-[var(--color-border-hairline)] px-[10px] py-2 font-mono text-[10px] text-[var(--color-text-secondary)]">
                webhook · {admin.access.webhookChannel}
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
              MEMBRES · {admin.members.length + admin.extraMembersCount}
            </div>
            <div className="mt-[11px] flex flex-col gap-2">
              {admin.members.map((member) => (
                <div key={member.name} className="flex items-center gap-[9px]">
                  <AvatarPlaceholder size={22} />
                  <span className="flex-1 font-mono text-[11px]">{member.name}</span>
                  {member.role === "admin" ? (
                    <span className="px-[6px] py-[2px] font-mono text-[10px]" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
                      ADMIN
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">membre</span>
                  )}
                </div>
              ))}
              <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                + {admin.extraMembersCount} autres
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
