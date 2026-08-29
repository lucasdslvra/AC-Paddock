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
