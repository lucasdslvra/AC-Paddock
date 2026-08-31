"use client";

import { useState, type FormEvent } from "react";
import { InlineEditActions } from "@/components/InlineEditActions";
import { TagInput } from "@/components/TagInput";
import type { ApiMod } from "@/lib/mods/serialize";
import { usePatchMod } from "@/lib/mods/usePatchMod";

interface ModInlineTagsEditProps {
  modId: string;
  initialTags: string[];
  onSaved: (mod: ApiMod) => void;
  onCancel: () => void;
}

/**
 * US-C1 / US-B3 — les tags de la fiche, retouchés en place.
 *
 * Le même `TagInput` que le formulaire complet : l'autocomplétion est ce qui évite les
 * variantes d'un même tag (cahier §2.2), et une saisie libre ici les ramènerait.
 *
 * La liste entière est envoyée, pas seulement le tag ajouté : c'est la sémantique de la
 * route (« tags » présent remplace l'ensemble), et c'est aussi ce qui permet d'en
 * retirer un depuis la fiche.
 */
export function ModInlineTagsEdit({
  modId,
  initialTags,
  onSaved,
  onCancel,
}: ModInlineTagsEditProps) {
  const { save, isPending, error } = usePatchMod(modId);
  const [tags, setTags] = useState(initialTags);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mod = await save({ tags });
    if (mod) onSaved(mod);
  }

  // Pas d'Échap pour sortir ici, contrairement aux autres retouches : la touche referme
  // déjà la liste de propositions du champ (`TagInput`), et lui faire aussi annuler la
  // saisie perdrait les tags ajoutés d'une frappe de trop.
  return (
    <form onSubmit={handleSubmit} className="mt-3 w-full max-w-[420px]">
      <TagInput value={tags} onChange={setTags} />
      <InlineEditActions isPending={isPending} error={error} onCancel={onCancel} />
    </form>
  );
}
