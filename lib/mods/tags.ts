// Normalisation des tags, partagée par le formulaire, les routes API et le catalogue.
// Le cahier §2.2 demande une autocomplétion « pour éviter les doublons/variantes » :
// l'autocomplétion seule n'y suffit pas — rien n'empêche de taper `Drift` à côté d'un
// `drift` existant. C'est cette normalisation qui fait converger les deux saisies vers
// la même ligne `Tag`, et le `@unique` sur `Tag.name` qui la fait respecter en base.

export const MAX_TAGS_PER_MOD = 8;
export const TAG_MIN_LENGTH = 2;
export const TAG_MAX_LENGTH = 24;

/**
 * Forme canonique d'un tag : minuscules, sans accent, mots liés par des tirets.
 * `  Drift Japonais ` et `drift-japonais` donnent le même résultat.
 *
 * Les accents sont retirés (`réaliste` → `realiste`) plutôt que conservés : un membre
 * qui tape sans accent ne doit pas créer un second tag à côté du premier, et
 * l'autocomplétion travaille sur ces formes normalisées.
 *
 * Renvoie `""` si rien d'exploitable ne subsiste — à l'appelant de l'écarter.
 */
export function normalizeTagName(raw: string): string {
  return raw
    .normalize("NFD")
    // Bloc « Combining Diacritical Marks » : les accents détachés par NFD.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Tout ce qui n'est ni lettre ni chiffre devient un séparateur : espaces,
    // underscores, ponctuation… `S-Body` et `s body` se rejoignent ainsi.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalise une liste de tags : formes canoniques, vides écartés, doublons fusionnés.
 * L'ordre de première apparition est conservé — c'est celui que le membre a saisi.
 *
 * Accepte du `unknown` parce qu'elle sert aussi de `preprocess` Zod, où la valeur vient
 * d'un JSON non validé : tout ce qui n'est pas un tableau de chaînes devient `[]`, et
 * c'est le schéma derrière qui décidera si c'est acceptable.
 */
export function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = normalizeTagName(entry);
    if (name) seen.add(name);
  }
  return Array.from(seen);
}

/**
 * Lit une liste de tags écrite dans une URL — `?tags=drift,jdm`, la forme utilisée par
 * le catalogue (US-C2), et `?tags=drift&tags=jdm`, celle des clients HTTP classiques.
 * Les deux mènent au même tableau normalisé.
 */
export function parseTagsParam(values: readonly string[]): string[] {
  return normalizeTagList(values.flatMap((value) => value.split(",")));
}

/** Écrit une liste de tags dans une URL. Réciproque de `parseTagsParam`. */
export function serializeTagsParam(tags: readonly string[]): string {
  return tags.join(",");
}
