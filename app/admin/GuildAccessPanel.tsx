"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import type { ApiAuthorizedGuild, ApiGuildAccess } from "@/lib/admin/settings";
import { admin } from "@/lib/mock-data";

/**
 * US-K1 — les serveurs Discord qui donnent accès à l'application (cahier §2.1).
 *
 * L'appartenance est vérifiée à chaque connexion, contre cette liste : ajouter un
 * serveur ouvre la porte à tout un groupe, en retirer un la referme à la connexion
 * suivante. D'où le verrou, qui n'empêche que la suppression — un serveur verrouillé
 * donne accès comme les autres, mais il faut le déverrouiller pour le retirer.
 *
 * Le serveur du déploiement (`DISCORD_GUILD_ID`) figure en tête, sans bouton : il ne se
 * change que dans la configuration. C'est voulu — tant qu'il est là, aucune manœuvre
 * depuis cet écran ne peut fermer l'accès à tout le monde, l'admin compris.
 */
export function GuildAccessPanel({ access }: { access: ApiGuildAccess }) {
  const router = useRouter();

  const [guildId, setGuildId] = useState("");
  const [name, setName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ guildId?: string; name?: string }>({});
  const [error, setError] = useState<string | null>(null);

  /** L'identifiant de la ligne dont la suppression attend confirmation. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsAdding(true);

    try {
      const response = await fetch("/api/admin/guilds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: guildId.trim(), name: name.trim() }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors);
        setError(body?.fieldErrors ? null : (body?.error ?? "Ce serveur n'a pas pu être ajouté."));
        return;
      }

      setGuildId("");
      setName("");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsAdding(false);
    }
  }

  async function setLocked(guild: ApiAuthorizedGuild, locked: boolean) {
    if (!guild.id) return;
    setError(null);
    setBusyId(guild.id);

    try {
      const response = await fetch(`/api/admin/guilds/${guild.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Le verrou n'a pas pu être changé.");
        return;
      }

      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(guild: ApiAuthorizedGuild) {
    if (!guild.id) return;
    setError(null);
    setBusyId(guild.id);

    try {
      const response = await fetch(`/api/admin/guilds/${guild.id}`, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Ce serveur n'a pas pu être retiré.");
        return;
      }

      setPendingDelete(null);
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-sm border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
        ACCÈS · {access.guilds.length} serveur{access.guilds.length > 1 ? "s" : ""}
      </div>

      <div className="mt-3">
        <div className="font-sans text-xs font-medium">Serveurs Discord autorisés</div>

        {access.configuredGuildId === null && (
          <p
            role="alert"
            className="mt-[7px] font-mono text-[10px] leading-[1.6] text-[var(--color-danger-text)]"
          >
            DISCORD_GUILD_ID n&apos;est pas renseigné : plus rien ne garantit qu&apos;il
            restera un serveur autorisé si tu retires ceux d&apos;ici.
          </p>
        )}

        <div className="mt-[7px] flex flex-col gap-[6px]">
          {access.guilds.length === 0 && (
            <p className="font-mono text-[10.5px] leading-[1.6] text-[var(--color-danger-text)]">
              Aucun serveur autorisé — personne ne peut se connecter.
            </p>
          )}

          {access.guilds.map((guild) => (
            <GuildLine
              key={guild.guildId}
              guild={guild}
              busy={busyId === guild.id}
              confirming={pendingDelete === guild.id}
              onConfirmDelete={() => {
                setError(null);
                setPendingDelete(guild.id);
              }}
              onCancelDelete={() => setPendingDelete(null)}
              onDelete={() => handleDelete(guild)}
              onToggleLock={(locked) => setLocked(guild, locked)}
            />
          ))}
        </div>

        <div className="mt-[7px] font-mono text-[10px] leading-[1.6] text-[var(--color-text-secondary)]">
          Vérifié à chaque connexion. Quitter le serveur — ou le retirer d&apos;ici — coupe
          l&apos;accès à la session suivante.
        </div>
      </div>

      <form
        onSubmit={handleAdd}
        className="mt-[14px] flex flex-col gap-2 border-t border-[var(--color-border-hairline)] pt-[14px]"
      >
        <div className="font-sans text-xs font-medium">Ouvrir l&apos;accès à un serveur</div>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
            identifiant du serveur · Discord → mode développeur → clic droit → copier l&apos;ID
          </span>
          <input
            value={guildId}
            onChange={(event) => setGuildId(event.target.value)}
            inputMode="numeric"
            maxLength={20}
            placeholder="150348…"
            aria-label="Identifiant du serveur Discord"
            aria-invalid={fieldErrors.guildId !== undefined}
            className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[11px] py-[9px] font-mono text-[11px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </label>
        {fieldErrors.guildId && (
          <p role="alert" className="font-mono text-[10px] text-[var(--color-danger-text)]">
            {fieldErrors.guildId}
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
            nom · facultatif, retrouvé tout seul si le widget du serveur est activé
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Les Briscards"
            aria-label="Nom du serveur Discord"
            className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[11px] py-[9px] font-mono text-[11px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </label>
        {fieldErrors.name && (
          <p role="alert" className="font-mono text-[10px] text-[var(--color-danger-text)]">
            {fieldErrors.name}
          </p>
        )}

        {error && (
          <p role="alert" className="font-mono text-[10px] leading-[1.6] text-[var(--color-danger-text)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isAdding || guildId.trim() === ""}
          className="btn-solid self-start rounded-sm px-[13px] py-2 font-sans text-xs font-semibold disabled:opacity-60"
          style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
        >
          {isAdding ? "Ajout…" : "Autoriser ce serveur"}
        </button>
      </form>

      <div className="mt-[14px] flex flex-col gap-2 border-t border-[var(--color-border-hairline)] pt-[14px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-sans text-xs font-medium">Notifier sur Discord</div>
            <div className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
              nouvelle soirée + nouveau mod
            </div>
          </div>
          {/* Maquette : aucun webhook n'est appelé pour l'instant. */}
          <ToggleSwitch on={admin.access.notifyDiscord} />
        </div>
        <div className="rounded-sm bg-[var(--color-border-hairline)] px-[10px] py-2 font-mono text-[10px] text-[var(--color-text-secondary)]">
          webhook · {admin.access.webhookChannel}
        </div>
      </div>
    </div>
  );
}

interface GuildLineProps {
  guild: ApiAuthorizedGuild;
  busy: boolean;
  confirming: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onToggleLock: (locked: boolean) => void;
}

function GuildLine({
  guild,
  busy,
  confirming,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onToggleLock,
}: GuildLineProps) {
  return (
    <div className="rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[9px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
          {/* Le nom manque tant que personne du serveur ne s'est connecté et que son
              widget public est désactivé : l'identifiant reste, il suffit à l'identifier. */}
          {guild.name ?? "nom inconnu"} · {guild.guildIdMasked}
        </span>

        {guild.fromConfig ? (
          <span
            className="flex-none font-mono text-[9.5px] text-[var(--color-text-faint)]"
            title="Ce serveur vient de DISCORD_GUILD_ID : il se change au déploiement, et garantit qu'un accès reste toujours ouvert."
          >
            déploiement
          </span>
        ) : (
          <>
            <span className="flex-none font-mono text-[9.5px] text-[var(--color-text-muted)]">
              {guild.locked ? "verrouillé" : "supprimable"}
            </span>
            <ToggleSwitch
              on={guild.locked}
              onToggle={(next) => onToggleLock(next)}
              label={`${guild.locked ? "Déverrouiller" : "Verrouiller"} ${guild.name ?? guild.guildIdMasked}`}
            />
            {confirming ? (
              <span className="flex flex-none gap-1">
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={busy}
                  className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[6px] py-[2px] font-mono text-[10px] disabled:opacity-60"
                >
                  non
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="btn-solid rounded-sm px-[6px] py-[2px] font-mono text-[10px] disabled:opacity-60"
                  style={{ background: "var(--color-danger)", color: "#fff" }}
                >
                  {busy ? "…" : "oui"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={guild.locked || busy}
                aria-label={`Retirer ${guild.name ?? guild.guildIdMasked}`}
                title={
                  guild.locked
                    ? "Verrouillé : lève le verrou pour pouvoir le retirer."
                    : "Retirer ce serveur — ses membres perdront l'accès à leur prochaine connexion."
                }
                className="btn-danger flex-none rounded-sm px-[6px] py-[2px] font-mono text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  border: "1px solid var(--color-border-strong)",
                  color: "var(--color-text-muted)",
                }}
              >
                ×
              </button>
            )}
          </>
        )}
      </div>

      {confirming && (
        <p className="mt-[6px] font-mono text-[9.5px] leading-[1.6] text-[var(--color-text-muted)]">
          Ses membres ne pourront plus se connecter. Leurs fiches, votes et soirées
          restent en place.
        </p>
      )}

      {guild.addedBy && (
        <div className="mt-[4px] font-mono text-[9.5px] text-[var(--color-text-faint)]">
          ouvert par {guild.addedBy}
        </div>
      )}
    </div>
  );
}
