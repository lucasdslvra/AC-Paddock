import "server-only";
import { prisma } from "@/lib/prisma";

// Côté base des tags (US-C1) : c'est ici que les noms saisis deviennent des lignes
// `Tag`, et que l'ensemble des tags d'une fiche est remplacé. Les noms reçus sont
// supposés déjà normalisés par `normalizeTagList` — le schéma Zod s'en charge à la
// frontière de l'API, ce module n'est jamais appelé sur de la saisie brute.

/**
 * « findOrCreate » du cahier : les tags déjà connus sont réutilisés, les nouveaux
 * créés à la volée. Renvoie leurs ids, dans l'ordre des noms reçus.
 *
 * Deux membres peuvent enregistrer une fiche avec le même tag neuf au même instant :
 * `createMany` + `skipDuplicates` laisse Postgres arbitrer sur l'unicité de `name`
 * plutôt qu'un `findMany` suivi d'un `create`, qui perdrait la course et lèverait une
 * violation de contrainte. La lecture qui suit voit le tag quel que soit le gagnant.
 */
export async function findOrCreateTags(names: readonly string[]): Promise<string[]> {
  if (names.length === 0) return [];

  await prisma.tag.createMany({
    data: names.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const rows = await prisma.tag.findMany({
    where: { name: { in: [...names] } },
    select: { id: true, name: true },
  });

  const idByName = new Map(rows.map((row) => [row.name, row.id]));
  return names.flatMap((name) => {
    const id = idByName.get(name);
    return id ? [id] : [];
  });
}

/** Lignes `ModTag` à créer pour ces tags, les tags manquants étant créés au passage. */
async function tagRows(names: readonly string[]) {
  const tagIds = await findOrCreateTags(names);
  return tagIds.map((tagId) => ({ tagId }));
}

/** Tags d'une fiche qu'on est en train de créer (POST /api/mods). */
export async function buildTagCreateWrite(names: readonly string[]) {
  return { create: await tagRows(names) };
}

/**
 * Tags d'une fiche existante (PATCH /api/mods/[id]) : l'ensemble est remplacé, pas
 * complété.
 *
 * Le `deleteMany: {}` est ce qui rend le retrait d'un tag possible : le formulaire
 * renvoie la liste voulue, pas un delta, donc un tag absent de la liste doit être
 * détaché. Sans vidage préalable, il resterait attaché.
 *
 * Il n'a pas d'équivalent à la création — `deleteMany` n'existe pas sur un `create`
 * imbriqué, la fiche n'ayant par définition encore aucune association.
 */
export async function buildTagReplaceWrite(names: readonly string[]) {
  return { deleteMany: {}, create: await tagRows(names) };
}
