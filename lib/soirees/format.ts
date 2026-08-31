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

const SOIREE_SHORT_DAY_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
});

const SOIREE_MONTH_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
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
 * « 4 septembre » — la soirée nommée à l'intérieur d'une phrase (« Engager dans la
 * soirée du 4 septembre »). Ni l'heure ni l'année : la soirée en cours est toujours
 * proche, et une date longue déborderait du bouton.
 */
export function formatSoireeShortDay(date: Date): string {
  return ordinalFirst(SOIREE_SHORT_DAY_FORMATTER.format(date), date);
}

/**
 * « 1 août » → « 1er août ». Le premier du mois est le seul jour que le français écrit
 * en ordinal, et `Intl` ne le sait pas : il rend « 1 », qui se lit comme une faute au
 * milieu d'une phrase (« la soirée du 1 août »).
 */
function ordinalFirst(label: string, date: Date): string {
  return date.getDate() === 1 ? label.replace(/^1(?=\D)/, "1er") : label;
}

/** « février 2026 » — l'origine de l'archive, en tête de l'historique (US-I1). */
export function formatSoireeMonth(date: Date): string {
  return SOIREE_MONTH_FORMATTER.format(date);
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
