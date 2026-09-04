"use client";

import { UserAvatar } from "@/components/UserAvatar";
import { DeletionJournal } from "@/app/admin/DeletionJournal";
import { GuildAccessPanel } from "@/app/admin/GuildAccessPanel";
import { ModerationPanel } from "@/app/admin/ModerationPanel";
import { SoireeCreateForm } from "@/app/admin/SoireeCreateForm";
import { StoragePanel } from "@/app/admin/StoragePanel";
import { TagsPanel } from "@/app/admin/TagsPanel";
import { UploadSizeForm } from "@/app/admin/UploadSizeForm";
import type { DeletionLogPage } from "@/lib/admin/deletion-log";
import type { ModerationList } from "@/lib/admin/moderation";
import {
  formatMemberSeenDate,
  type AdminMemberRow,
  type AdminModRow,
  type AdminTagRow,
  type ApiAdminConfig,
  type ApiGuildAccess,
  type ApiStorageUsage,
} from "@/lib/admin/settings";

interface AdminViewProps {
  mods: ModerationList<AdminModRow>;
  tags: ModerationList<AdminTagRow>;
  deletions: DeletionLogPage;
  config: ApiAdminConfig;
  members: ModerationList<AdminMemberRow>;
  access: ApiGuildAccess;
  /** US-H1 — l'occupation du bucket. `null` si Cloudflare n'a pas pu être interrogé. */
  storage: ApiStorageUsage | null;
}

/**
 * US-K1 — la mise en page de l'espace admin.
 *
 * Tout ce qui s'affiche ici vient de la page serveur : le contrôle de rôle et l'en-tête
 * sont dans `layout.tsx`, et il n'y a donc plus rien à vérifier à ce niveau. La mise en
 * page ne fait que répartir les panneaux, qui portent chacun leurs propres écritures.
 *
 * Il n'y reste plus rien de maquette. Le serveur affiché en face de chaque membre est
 * celui devant lequel sa dernière connexion l'a vérifié, pas celui qu'on suppose ; la
 * rétention et l'occupation du bucket viennent de `StoragePanel`, qui lit l'un en base
 * et l'autre chez Cloudflare.
 */
export function AdminView({
  mods,
  tags,
  deletions,
  config,
  members,
  access,
  storage,
}: AdminViewProps) {
  return (
    <div className="grid grid-cols-1 gap-[18px] p-4 sm:p-5 lg:grid-cols-[1fr_330px]">
      <div className="flex flex-col gap-[14px]">
        <ModerationPanel mods={mods} tagCount={tags.total} />
        <DeletionJournal entries={deletions.entries} olderCount={deletions.olderCount} />
        <GuildAccessPanel access={access} />

        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            MEMBRES · {members.total}
          </div>
          <div className="mt-[11px] flex flex-col gap-2">
            {members.rows.length === 0 && (
              <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                Personne ne s&apos;est encore connecté.
              </div>
            )}
            {members.rows.map((member) => (
              <MemberLine key={member.discordId} member={member} />
            ))}
            {members.total > members.rows.length && (
              <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                + {members.total - members.rows.length} autres
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* US-G1 — cahier §2.6 : c'est l'admin/organisateur qui crée les soirées. */}
        <SoireeCreateForm guilds={access.guilds} />

        <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
            RÉGLAGES
          </div>

          <UploadSizeForm config={config} />

          <StoragePanel
            usage={storage}
            lastSweep={config.lastSweep}
            sweepStale={config.sweepStale}
          />
        </div>

        <TagsPanel tags={tags} />
      </div>
    </div>
  );
}

/**
 * Un membre : son pseudo, le serveur devant lequel sa dernière connexion l'a vérifié,
 * et son rôle.
 *
 * Le serveur peut manquer — la ligne a été créée par une écriture, avant que les
 * connexions ne soient enregistrées — ou avoir quitté la liste des serveurs autorisés
 * (panneau ACCÈS) depuis. Les deux cas se disent, plutôt que d'afficher le serveur
 * courant pour tout le monde : ce serait affirmer une vérification qui n'a pas eu lieu.
 */
function MemberLine({ member }: { member: AdminMemberRow }) {
  return (
    <div className="flex items-center gap-[9px]">
      <UserAvatar src={member.avatarUrl} name={member.username} size={22} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{member.username}</span>

      <span
        className="hidden min-w-0 max-w-[220px] truncate font-mono text-[10px] sm:block"
        style={{
          color: member.isAuthorizedGuild
            ? "var(--color-text-secondary)"
            : "var(--color-text-faint)",
        }}
        title={
          member.guildName
            ? member.isAuthorizedGuild
              ? `Vérifié sur ${member.guildName} à sa dernière connexion.`
              : `Vérifié sur ${member.guildName}, qui n'est plus le serveur autorisé.`
            : "Aucune connexion enregistrée depuis le suivi des serveurs."
        }
      >
        {member.guildName ?? "serveur non vérifié"}
        {member.guildName && !member.isAuthorizedGuild && " ⚠"}
      </span>

      {member.lastSeenAt && (
        <span className="hidden font-mono text-[10px] text-[var(--color-text-faint)] md:block">
          vu le {formatMemberSeenDate(new Date(member.lastSeenAt))}
        </span>
      )}

      {member.isAdmin ? (
        <span
          className="flex-none px-[6px] py-[2px] font-mono text-[10px]"
          style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
        >
          ADMIN
        </span>
      ) : (
        <span className="flex-none font-mono text-[10px] text-[var(--color-text-muted)]">
          membre
        </span>
      )}
    </div>
  );
}
