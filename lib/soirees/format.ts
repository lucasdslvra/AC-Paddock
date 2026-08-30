const SOIREE_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const SOIREE_DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** « vendredi 4 septembre 21:00 » — le titre d'une soirée, date et heure comprises. */
export function formatSoireeDate(date: Date): string {
  return SOIREE_DATE_FORMATTER.format(date);
}

/** « 4 septembre 2026 » — pour l'historique, où l'heure n'apprend plus rien. */
export function formatSoireeDay(date: Date): string {
  return SOIREE_DAY_FORMATTER.format(date);
}

/**
 * « dans 3 jours », « ce soir », « demain ». Compté en jours de calendrier, pas en
 * multiples de 24 h : une soirée à 21 h ce soir est « ce soir », pas « dans 0 jour ».
 */
export function formatSoireeCountdown(date: Date, now: Date = new Date()): string {
  const startOf = (value: Date) => {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };

  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  if (days < 0) return "passée";
  if (days === 0) return "ce soir";
  if (days === 1) return "demain";
  return `dans ${days} jours`;
}
