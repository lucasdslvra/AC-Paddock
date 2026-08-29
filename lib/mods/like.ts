/**
 * Échappe les jokers d'un `LIKE`/`ILIKE` pour qu'une saisie reste du texte littéral.
 *
 * Sans ça, un membre qui tape `%` dans la recherche du catalogue reçoit le catalogue
 * entier, et `silvia_s15` ne trouve pas la fiche qui porte exactement ce nom — `_`
 * remplace n'importe quel caractère. Ni Prisma (`contains`) ni les requêtes brutes ne
 * font cet échappement : le motif est construit avec la valeur telle quelle.
 *
 * L'antislash est le caractère d'échappement par défaut de Postgres, il n'y a donc pas
 * de clause `ESCAPE` à ajouter derrière — mais il doit lui-même être doublé.
 */
export function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
