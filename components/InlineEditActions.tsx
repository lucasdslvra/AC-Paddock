"use client";

interface InlineEditActionsProps {
  /** Une requête est en vol : les deux boutons se ferment le temps de l'aller-retour. */
  isPending: boolean;
  /** Message d'échec de l'enregistrement, `null` sinon. */
  error?: string | null;
  onCancel: () => void;
  /** Vrai quand le champ n'a rien d'enregistrable (image pas encore envoyée). */
  disabled?: boolean;
}

/**
 * Le pied commun des retouches en place (US-B3) : « Enregistrer », « Annuler », et
 * l'erreur du serveur juste au-dessus.
 *
 * Le bouton d'enregistrement est un `submit` : chaque éditeur est un vrai formulaire,
 * ce qui donne la touche entrée sans code, et Échap est câblé par l'éditeur lui-même.
 */
export function InlineEditActions({
  isPending,
  error,
  onCancel,
  disabled = false,
}: InlineEditActionsProps) {
  return (
    <>
      {error && (
        <p role="alert" className="mt-[6px] font-mono text-[10.5px] leading-[1.5] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
      <div className="mt-[9px] flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending || disabled}
          aria-busy={isPending}
          className="btn-solid rounded-sm px-[13px] py-[7px] font-sans text-[11px] font-semibold disabled:opacity-60"
          style={{ background: "var(--color-emphasis-bg)", color: "var(--color-emphasis-text)" }}
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="btn-outline rounded-sm border border-[var(--color-border-strong)] px-[13px] py-[7px] font-sans text-[11px] font-medium disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </>
  );
}
