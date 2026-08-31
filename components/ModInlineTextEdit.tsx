"use client";

import { useCallback, useState, type FormEvent, type KeyboardEvent } from "react";
import { InlineEditActions } from "@/components/InlineEditActions";
import type { ApiMod } from "@/lib/mods/serialize";
import { usePatchMod } from "@/lib/mods/usePatchMod";

interface ModInlineTextEditProps {
  modId: string;
  /** Le champ envoyé à la route — la retouche ne porte que sur lui. */
  field: "description" | "url";
  initialValue: string;
  /** Une description tient sur plusieurs lignes, un lien sur une seule. */
  multiline?: boolean;
  placeholder?: string;
  /** Rappel sous le champ : ce que le lecteur doit savoir avant d'enregistrer. */
  hint?: string;
  onSaved: (mod: ApiMod) => void;
  onCancel: () => void;
}

/**
 * US-B3 — corriger la description ou le lien sans quitter la fiche.
 *
 * Une description vidée est envoyée telle quelle : la route lit la présence de la clé,
 * donc « description: "" » l'efface. Un lien vide, lui, est refusé par le schéma — la
 * fiche ne peut pas rester sans lien externe (cahier §2.2), et le message le dit.
 */
export function ModInlineTextEdit({
  modId,
  field,
  initialValue,
  multiline = false,
  placeholder,
  hint,
  onSaved,
  onCancel,
}: ModInlineTextEditProps) {
  const { save, isPending, error } = usePatchMod(modId);
  const [value, setValue] = useState(initialValue);

  // Le champ prend le focus à l'ouverture, caret en fin de texte : la retouche part de
  // ce qui est écrit, on ne remplace pas une description entière pour un mot. Une ref de
  // rappel plutôt qu'un effet — elle vaut pour les deux types de champ, qui n'ont pas la
  // même interface TypeScript mais bien la même méthode.
  const focusAtEnd = useCallback((element: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mod = await save({ [field]: value.trim() });
    if (mod) onSaved(mod);
  }

  // Échap referme sans enregistrer, comme partout ailleurs — sauf pendant l'envoi, la
  // requête étant déjà partie.
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !isPending) {
      event.preventDefault();
      onCancel();
    }
  }

  const className =
    "mt-2 w-full rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-field)] px-[13px] py-[11px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]";

  return (
    <form onSubmit={handleSubmit} className="mt-[9px]">
      {multiline ? (
        <textarea
          ref={focusAtEnd}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder={placeholder}
          aria-label="Description de la fiche"
          className={`${className} h-[96px] font-sans text-sm leading-[1.6]`}
        />
      ) : (
        <input
          ref={focusAtEnd}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder={placeholder}
          aria-label="Lien externe de la fiche"
          className={`${className} font-mono text-xs`}
        />
      )}
      {hint && (
        <p className="mt-[6px] font-mono text-[10px] leading-[1.5] text-[var(--color-text-muted)]">
          {hint}
        </p>
      )}
      <InlineEditActions isPending={isPending} error={error} onCancel={onCancel} />
    </form>
  );
}
