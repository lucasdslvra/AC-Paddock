"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MAX_TAGS_PER_MOD, normalizeTagName, TAG_MIN_LENGTH } from "@/lib/mods/tags";
import { TagPill } from "./TagPill";

/** Un tag proposé par `GET /api/tags`, avec le nombre de fiches qui le portent. */
interface TagSuggestion {
  name: string;
  modCount: number;
}

/** Ligne de la liste déroulante : un tag existant, ou la création du terme saisi. */
interface TagOption {
  name: string;
  /** `null` pour la ligne « créer ce tag », qui ne correspond à rien en base. */
  modCount: number | null;
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Message d'erreur du champ, tel que renvoyé par le schéma ou l'API. */
  error?: string;
}

/**
 * US-C1 — saisie multi-tags avec autocomplétion et création à la volée.
 *
 * Les propositions viennent de `GET /api/tags` : ce sont les tags déjà employés par le
 * groupe, les plus utilisés d'abord. Montrer l'existant est ce qui évite les variantes
 * (cahier §2.2) ; `normalizeTagName` rattrape le reste, en faisant tomber `Drift`,
 * `drift` et `  DRIFT ` sur le même tag.
 *
 * Le tag n'est créé en base qu'à l'enregistrement de la fiche, par le « findOrCreate »
 * de la route : ce composant ne manipule que des noms.
 */
export function TagInput({ value, onChange, error }: TagInputProps) {
  const listId = useId();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = normalizeTagName(input);
  const isFull = value.length >= MAX_TAGS_PER_MOD;

  // Une requête par saisie stabilisée. Le nettoyage annule la précédente : sans lui,
  // une réponse lente arrivée après une plus récente écraserait la bonne liste.
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/tags?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        setSuggestions(await response.json());
      } catch {
        // Requête annulée ou réseau indisponible : l'autocomplétion est une aide, son
        // absence ne doit pas empêcher de saisir un tag à la main.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  const options = useMemo<TagOption[]>(() => {
    const available = suggestions
      .filter((tag) => !value.includes(tag.name))
      .slice(0, 6)
      .map((tag) => ({ name: tag.name, modCount: tag.modCount }));

    // La ligne « créer » n'apparaît que si le terme saisi est retenable et ne
    // correspond exactement à aucun tag connu — proposer de créer `drift` alors que
    // `drift` existe déjà serait précisément le doublon qu'on cherche à éviter.
    const isNew =
      query.length >= TAG_MIN_LENGTH &&
      !value.includes(query) &&
      !suggestions.some((tag) => tag.name === query);

    return isNew ? [...available, { name: query, modCount: null }] : available;
  }, [suggestions, value, query]);

  // La sélection clavier retient un nom, pas une position : la liste se recompose à
  // chaque frappe, et un index mémorisé désignerait la ligne d'à côté. Le nom disparu
  // de la liste, `findIndex` renvoie -1 et la sélection repart du haut.
  const highlight = Math.max(
    options.findIndex((option) => option.name === highlighted),
    0,
  );

  function addTag(name: string) {
    const tag = normalizeTagName(name);
    if (!tag || tag.length < TAG_MIN_LENGTH || value.includes(tag) || isFull) return;
    onChange([...value, tag]);
    setInput("");
    inputRef.current?.focus();
  }

  function removeTag(name: string) {
    onChange(value.filter((tag) => tag !== name));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // La virgule sépare les tags comme la touche entrée les valide : c'est le réflexe
    // de saisie le plus courant, et un tag n'en contient jamais (la normalisation la
    // transformerait en tiret).
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(options[highlight]?.name ?? input);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted(options[(highlight + step + options.length) % options.length].name);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    // Retour arrière sur un champ vide : on retire la dernière pastille, sans avoir à
    // viser sa croix à la souris.
    if (event.key === "Backspace" && input === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  const showList = isOpen && options.length > 0 && !isFull;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-muted)]">
          TAGS — OPTIONNELS
        </div>
        <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
          {value.length}/{MAX_TAGS_PER_MOD}
        </div>
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className="mt-2 flex flex-wrap items-center gap-[6px] border bg-[var(--color-field)] px-[11px] py-[9px]"
        style={{
          borderColor: error ? "var(--color-danger)" : "var(--color-border-strong)",
          borderRadius: showList ? "2px 2px 0 0" : "2px",
        }}
      >
        {value.map((tag) => (
          <TagPill key={tag} label={tag} active removable onClick={() => removeTag(tag)} />
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={() => setIsOpen(true)}
          // Un clic sur une proposition ne déclenche pas ce blur : la liste annule son
          // mousedown, le champ ne perd donc jamais le focus à ce moment-là.
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
          disabled={isFull}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={isFull ? `maximum ${MAX_TAGS_PER_MOD} tags` : "ajouter un tag"}
          className="min-w-[110px] flex-1 bg-transparent font-mono text-xs text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-faint)]"
        />
      </div>

      {showList && (
        <div
          id={listId}
          role="listbox"
          // Sans ça, le champ perd le focus avant que le clic n'aboutisse et la liste
          // disparaît sous le curseur.
          onMouseDown={(event) => event.preventDefault()}
          className="rounded-b-sm border border-t-0 border-[var(--color-border-strong)] bg-[var(--color-field)]"
        >
          {options.map((option, index) => (
            <button
              key={option.name}
              type="button"
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlighted(option.name)}
              onClick={() => addTag(option.name)}
              className="btn-outline flex w-full items-center justify-between border-b border-[var(--color-border-hairline)] px-3 py-2 text-left last:border-b-0"
              style={{ background: index === highlight ? "var(--color-border-hairline)" : "transparent" }}
            >
              <span className="font-mono text-[11px] text-[var(--color-foreground)]">
                {option.modCount === null ? `« ${option.name} » — créer ce tag` : option.name}
              </span>
              <span
                className="font-mono text-[10px]"
                style={{
                  color:
                    option.modCount === null ? "var(--color-link)" : "var(--color-text-muted)",
                }}
              >
                {option.modCount === null
                  ? "entrée"
                  : `${option.modCount} fiche${option.modCount > 1 ? "s" : ""}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="mt-[6px] font-mono text-[10.5px]" style={{ color: "var(--color-danger-text)" }}>
          {error}
        </p>
      ) : (
        <p className="mt-[6px] font-mono text-[10px] leading-[1.5] text-[var(--color-text-muted)]">
          Réutilise un tag proposé quand il existe : c&apos;est ce qui garde les fiches
          trouvables. Les majuscules et accents sont retirés à l&apos;enregistrement.
        </p>
      )}
    </div>
  );
}
