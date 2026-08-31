const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** « 29 août 2026 » — utilisé sur la fiche détail. */
export function formatCreatedAt(date: Date): string {
  return DATE_FORMATTER.format(date);
}

/** « 3 min », « 4 h », « 2 j » — utilisé sur les cartes du catalogue. */
export function formatAge(date: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

const SHORT_DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** Combien de jours de calendrier séparent deux instants (et non de tranches de 24 h). */
function calendarDaysBetween(date: Date, now: Date): number {
  const startOf = (value: Date) => {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  return Math.round((startOf(now) - startOf(date)) / 86_400_000);
}

/**
 * « il y a 4 h », « hier », « il y a 3 j », « 19 août » — la date d'une contribution
 * sur la fiche (cahier §2.2).
 *
 * Pas `formatAge` : sur une carte du catalogue, « 2 j » suffit à situer une fiche parmi
 * les autres, toutes récentes. Ici les entrées se lisent en colonne, du jour même à
 * plusieurs mois en arrière — « il y a 47 j » ne dit plus rien, alors qu'une date le dit.
 *
 * Le seuil est en jours de calendrier : une correction d'hier soir est « hier » à
 * 8 h du matin, pas « il y a 12 h ».
 */
export function formatContributionAge(date: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  const days = calendarDaysBetween(date, now);
  // Le même jour, l'heure écoulée est plus parlante que « aujourd'hui » : elle situe la
  // correction par rapport à celles d'à côté.
  if (days === 0) return `il y a ${Math.floor(minutes / 60)} h`;
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;

  // Au-delà de la semaine, une date. L'année n'apparaît que si ce n'est plus la même :
  // « 19 août » se lit sans elle, et le fil d'une fiche vit surtout sur quelques mois.
  return date.getFullYear() === now.getFullYear()
    ? SHORT_DAY_FORMATTER.format(date)
    : DATE_FORMATTER.format(date);
}

/** Affichage compact d'un lien : « racedepartment.com/downloads/… ». */
export function formatLinkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Le même lien sans son protocole, pour l'affichage. */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
