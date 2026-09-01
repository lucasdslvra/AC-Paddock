"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import type { ApiAuthorizedGuild, ApiGuildAccess } from "@/lib/admin/settings";

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
 *
 * US-L1/L2 — chaque ligne porte aussi le salon où ce groupe est prévenu. Les annonces
 * sont par serveur et non globales : le salon de l'un n'est pas ouvert à l'autre, et
 * une soirée appartient déjà à un serveur. Le salon se renseigne à l'ouverture de
 * l'accès ou plus tard, depuis la ligne — c'est rarement au même moment qu'on a
 * l'identifiant du serveur et l'URL du webhook sous la main.
 */
export function GuildAccessPanel({ access }: { access: ApiGuildAccess }) {
  const router = useRouter();

  const [guildId, setGuildId] = useState("");
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    guildId?: string;
    name?: string;
    webhookUrl?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);

  /** L'identifiant de la ligne dont la suppression attend confirmation. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** La ligne dont le salon est en cours de saisie, et ce qui y est tapé. */
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState("");
  const [webhookError, setWebhookError] = useState<string | null>(null);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsAdding(true);

    try {
      const response = await fetch("/api/admin/guilds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: guildId.trim(),
          name: name.trim(),
          webhookUrl: webhookUrl.trim(),
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        if (body?.fieldErrors) setFieldErrors(body.fieldErrors);
        setError(body?.fieldErrors ? null : (body?.error ?? "Ce serveur n'a pas pu être ajouté."));
        return;
      }

      setGuildId("");
      setName("");
      setWebhookUrl("");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur. Réessaie dans un instant.");
    } finally {
      setIsAdding(false);
    }
  }

  /**
   * Une modification quelconque d'un serveur : le verrou, l'interrupteur des annonces
   * ou le salon. Une seule fonction parce que c'est un seul aller-retour, avec un seul
   * traitement d'erreur — ce qui change est le corps envoyé.
   */
  async function patchGuild(
    guild: ApiAuthorizedGuild,
    patch: { locked?: boolean; notify?: boolean; webhookUrl?: string | null },
    fallback: string,
  ): Promise<boolean> {
    if (!guild.id) return false;
    setError(null);
    setBusyId(guild.id);

    try {
      const response = await fetch(`/api/admin/guilds/${guild.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.fieldErrors?.webhookUrl ?? body?.error ?? fallback;
        // L'erreur d'une URL de webhook s'affiche sous le champ où elle a été tapée,
        // pas en pied de panneau : c'est là qu'on la corrige.
        if (patch.webhookUrl !== undefined) setWebhookError(message);
        else setError(message);
        return false;
      }

      router.refresh();
      return true;
    } catch {
      const message = "Impossible de joindre le serveur. Réessaie dans un instant.";
      if (patch.webhookUrl !== undefined) setWebhookError(message);
      else setError(message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function saveWebhook(guild: ApiAuthorizedGuild, url: string | null) {
    setWebhookError(null);
    const done = await patchGuild(guild, { webhookUrl: url }, "Le salon n'a pas pu être enregistré.");
    if (done) {
      setEditingWebhook(null);
      setWebhookDraft("");
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
              onToggleLock={(locked) =>
                patchGuild(guild, { locked }, "Le verrou n'a pas pu être changé.")
              }
              onToggleNotify={(notify) =>
                patchGuild(guild, { notify }, "Les annonces n'ont pas pu être changées.")
              }
              editing={editingWebhook !== null && editingWebhook === guild.id}
              draft={webhookDraft}
              webhookError={editingWebhook === guild.id ? webhookError : null}
              onDraftChange={setWebhookDraft}
              onEditWebhook={() => {
                setWebhookError(null);
                // Jamais pré-rempli : l'écran ne connaît pas l'URL, seulement sa forme
                // tronquée. On en pose une nouvelle, on ne corrige pas l'ancienne.
                setWebhookDraft("");
                setEditingWebhook(guild.id);
              }}
              onCancelWebhook={() => {
                setEditingWebhook(null);
                setWebhookError(null);
              }}
              onSaveWebhook={() => saveWebhook(guild, webhookDraft.trim())}
              onClearWebhook={() => saveWebhook(guild, null)}
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

        {/* US-L1/L2 — le salon des annonces de ce groupe. Facultatif ici : il se pose
            aussi bien depuis la ligne du serveur, une fois l'accès ouvert. */}
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-[var(--color-text-muted)]">
            salon d&apos;annonces · facultatif · Discord → salon → Intégrations → Webhooks
          </span>
          <input
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            type="url"
            maxLength={200}
            placeholder="https://discord.com/api/webhooks/…"
            aria-label="Webhook Discord du salon d'annonces"
            aria-invalid={fieldErrors.webhookUrl !== undefined}
            className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[11px] py-[9px] font-mono text-[11px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
          />
        </label>
        {fieldErrors.webhookUrl && (
          <p role="alert" className="font-mono text-[10px] leading-[1.6] text-[var(--color-danger-text)]">
            {fieldErrors.webhookUrl}
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
  /** US-L2 — ouvre ou coupe les annonces de ce serveur, sans toucher à son salon. */
  onToggleNotify: (notify: boolean) => void;
  /** Vrai quand le champ de saisie du salon est ouvert sur cette ligne. */
  editing: boolean;
  draft: string;
  webhookError: string | null;
  onDraftChange: (value: string) => void;
  onEditWebhook: () => void;
  onCancelWebhook: () => void;
  onSaveWebhook: () => void;
  onClearWebhook: () => void;
}

function GuildLine({
  guild,
  busy,
  confirming,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onToggleLock,
  onToggleNotify,
  editing,
  draft,
  webhookError,
  onDraftChange,
  onEditWebhook,
  onCancelWebhook,
  onSaveWebhook,
  onClearWebhook,
}: GuildLineProps) {
  return (
    <div className="rounded-sm border border-[var(--color-border-strong)] px-[11px] py-[9px]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
          {/* Le nom manque tant que personne du serveur ne s'est connecté et que son
              widget public est désactivé : l'identifiant reste, il suffit à l'identifier. */}
          {guild.name ?? "nom inconnu"} · {guild.guildIdMasked}
        </span>

        {guild.isViewerGuild && (
          <span
            className="flex-none font-mono text-[9.5px] text-[var(--color-text-faint)]"
            title="Le serveur par lequel tu es entré."
          >
            le tien
          </span>
        )}

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

      <GuildWebhookRow
        guild={guild}
        busy={busy}
        editing={editing}
        draft={draft}
        webhookError={webhookError}
        onDraftChange={onDraftChange}
        onEditWebhook={onEditWebhook}
        onCancelWebhook={onCancelWebhook}
        onSaveWebhook={onSaveWebhook}
        onClearWebhook={onClearWebhook}
        onToggleNotify={onToggleNotify}
      />

      {guild.addedBy && (
        <div className="mt-[4px] font-mono text-[9.5px] text-[var(--color-text-faint)]">
          ouvert par {guild.addedBy}
        </div>
      )}
    </div>
  );
}

/**
 * US-L1/L2 — le salon d'annonces d'un serveur, sous sa ligne.
 *
 * L'URL n'est jamais affichée : le serveur n'en envoie qu'une forme tronquée, parce que
 * son jeton vaut droit d'écriture dans le salon. On ne modifie donc pas un webhook, on
 * en pose un nouveau — et le champ part toujours vide.
 *
 * Le serveur du déploiement n'a rien à régler ici : son salon est dans
 * `DISCORD_WEBHOOK_URL`, comme son identifiant est dans `DISCORD_GUILD_ID`.
 */
function GuildWebhookRow({
  guild,
  busy,
  editing,
  draft,
  webhookError,
  onDraftChange,
  onEditWebhook,
  onCancelWebhook,
  onSaveWebhook,
  onClearWebhook,
  onToggleNotify,
}: Omit<GuildLineProps, "confirming" | "onConfirmDelete" | "onCancelDelete" | "onDelete" | "onToggleLock">) {
  if (guild.fromConfig) {
    return (
      <div className="mt-[6px] font-mono text-[9.5px] leading-[1.6] text-[var(--color-text-faint)]">
        {guild.webhook
          ? `salon : ${guild.webhook} · défini au déploiement`
          : "aucun salon d'annonces · renseigne DISCORD_WEBHOOK_URL"}
      </div>
    );
  }

  return (
    <div className="mt-[6px] border-t border-[var(--color-border-hairline)] pt-[6px]">
      <div className="flex items-center gap-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-[9.5px]"
          style={{
            color: guild.webhook
              ? "var(--color-text-secondary)"
              : "var(--color-text-faint)",
          }}
        >
          {guild.webhook ? `salon : ${guild.webhook}` : "aucun salon d'annonces"}
        </span>

        {guild.webhook && (
          <>
            <span className="flex-none font-mono text-[9.5px] text-[var(--color-text-muted)]">
              {guild.notify ? "annonces" : "en sourdine"}
            </span>
            <ToggleSwitch
              on={guild.notify}
              onToggle={(next) => onToggleNotify(next)}
              label={`${guild.notify ? "Couper" : "Rouvrir"} les annonces de ${guild.name ?? guild.guildIdMasked}`}
            />
          </>
        )}

        {!editing && (
          <button
            type="button"
            onClick={onEditWebhook}
            disabled={busy}
            className="btn-outline flex-none rounded-sm border border-[var(--color-border-strong)] px-[6px] py-[2px] font-mono text-[10px] disabled:opacity-60"
          >
            {guild.webhook ? "changer" : "définir"}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-[6px] flex flex-col gap-[6px]">
          <input
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            type="url"
            maxLength={200}
            autoFocus
            placeholder="https://discord.com/api/webhooks/…"
            aria-label={`Webhook du salon de ${guild.name ?? guild.guildIdMasked}`}
            aria-invalid={webhookError !== null}
            className="rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[9px] py-[7px] font-mono text-[10.5px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
          />

          {webhookError && (
            <p role="alert" className="font-mono text-[9.5px] leading-[1.6] text-[var(--color-danger-text)]">
              {webhookError}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={onSaveWebhook}
              disabled={busy || draft.trim() === ""}
              className="btn-solid rounded-sm px-[9px] py-[4px] font-mono text-[10px] disabled:opacity-60"
              style={{ background: "var(--color-amber)", color: "var(--color-ink)" }}
            >
              {busy ? "…" : "enregistrer"}
            </button>
            <button
              type="button"
              onClick={onCancelWebhook}
              disabled={busy}
              className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[9px] py-[4px] font-mono text-[10px] disabled:opacity-60"
            >
              annuler
            </button>
            {guild.webhook && (
              <button
                type="button"
                onClick={onClearWebhook}
                disabled={busy}
                title="Retire le salon : ce serveur reste autorisé, il n'est simplement plus prévenu."
                className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[9px] py-[4px] font-mono text-[10px] text-[var(--color-text-muted)] disabled:opacity-60"
              >
                retirer le salon
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
