"use client";

import { useSession } from "next-auth/react";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { DeletionJournal } from "@/app/admin/DeletionJournal";
import { ModerationPanel } from "@/app/admin/ModerationPanel";
import { SoireeCreateForm } from "@/app/admin/SoireeCreateForm";
import { TagsPanel } from "@/app/admin/TagsPanel";
import { UploadSizeForm } from "@/app/admin/UploadSizeForm";
import type { DeletionLogPage } from "@/lib/admin/deletion-log";
import type { ModerationList } from "@/lib/admin/moderation";
import type { AdminModRow, AdminTagRow, ApiAdminConfig } from "@/lib/admin/settings";
import { admin } from "@/lib/mock-data";

interface AdminViewProps {
  mods: ModerationList<AdminModRow>;
  tags: ModerationList<AdminTagRow>;
  deletions: DeletionLogPage;
  config: ApiAdminConfig;
}

/**
 * US-K1 — la mise en page de l'espace admin.
 *
 * Tout ce qui s'affiche ici vient de la page serveur : le contrôle de rôle et l'en-tête
 * sont dans `layout.tsx`, et il n'y a donc plus rien à vérifier à ce niveau. Le
 * composant reste client parce que ses panneaux écrivent — supprimer, régler — et que
 * le nom du serveur Discord se lit dans la session.
 *
 * Deux panneaux vivent encore sur `lib/mock-data.ts` : « ACCÈS » (hors la ligne du
 * serveur, réelle) et « MEMBRES ». Ils ne relèvent d'aucune US de l'Epic K — la gestion
 * des rôles n'est pas au backlog, le rôle se pose en base — et ils restent des maquettes
 * assumées plutôt que des écrans à moitié faits.
 */
export function AdminView({ mods, tags, deletions, config }: AdminViewProps) {
  const { data: session } = useSession();

  return (
    <div className="grid grid-cols-1 gap-[18px] p-5 lg:grid-cols-[1fr_330px]">
      <div className="flex flex-col gap-[14px]">
        <ModerationPanel mods={mods} tagCount={tags.total} />
        <DeletionJournal entries={deletions.entries} olderCount={deletions.olderCount} />
      </div>

      <div className="flex flex-col gap-3">
        {/* US-G1 — cahier §2.6 : c'est l'admin/organisateur qui crée les soirées. */}
        <SoireeCreateForm />

        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            RÉGLAGES
          </div>

          <UploadSizeForm config={config} />

          <div className="mt-4 border-t border-[var(--color-border-hairline)] pt-[14px]">
            <div className="font-sans text-xs font-medium">Rétention des fichiers</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[15px]">{admin.settings.retentionHours} h</span>
              {/* Cahier §2.7 : « règle simple et fixe ». Le délai n'est pas un réglage,
                  contrairement au plafond juste au-dessus. */}
              <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
                après l&apos;upload · non modifiable
              </span>
            </div>
            <div className="mt-[9px] flex items-center justify-between rounded-sm bg-[var(--color-border-hairline)] px-[11px] py-[9px]">
              <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">
                dernier nettoyage : {admin.settings.lastCleanupLabel}
              </span>
              <span
                className="px-[6px] py-[2px] font-mono text-[10px]"
                style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
              >
                OK
              </span>
            </div>
          </div>
        </div>

        <TagsPanel tags={tags} />

        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            ACCÈS
          </div>
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
                  <span
                    className="px-[6px] py-[2px] font-mono text-[10px]"
                    style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
                  >
                    ADMIN
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    membre
                  </span>
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
  );
}
