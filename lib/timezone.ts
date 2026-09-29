/**
 * Le fuseau du groupe. Toutes les dates affichées et tous les « jours de calendrier »
 * se comptent ici, et pas dans le fuseau de la machine qui exécute le code.
 *
 * Sans lui, le serveur (Vercel, en UTC) écrit « 19:00 » pour une soirée à 21 h, et les
 * annonces Discord — rédigées côté serveur, lues telles quelles — mentent d'une ou deux
 * heures selon la saison. Le navigateur, lui, tombait juste : d'où un site correct et un
 * Discord faux pour la même soirée.
 */
export const APP_TIME_ZONE = "Europe/Paris";

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** L'heure murale de Paris à cet instant, champ par champ. */
export function zonedParts(date: Date): ZonedParts {
  const parts: Record<string, number> = {};
  for (const part of PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts as unknown as ZonedParts;
}

/** Le décalage de Paris sur UTC à cet instant, en millisecondes (+1 h ou +2 h). */
function offsetMs(date: Date): number {
  const p = zonedParts(date);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

/** Minuit, heure de Paris, du jour qui contient `date`. */
export function startOfZonedDay(date: Date): Date {
  const p = zonedParts(date);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  // Le décalage est pris à minuit même : un changement d'heure (à 2 h ou 3 h) entre
  // minuit et `date` ne doit pas déplacer la borne.
  return new Date(midnightAsUtc - offsetMs(new Date(midnightAsUtc - offsetMs(date))));
}

/**
 * Combien de jours de calendrier parisiens séparent `from` de `to` (positif si `to`
 * est après). Des jours, pas des tranches de 24 h.
 */
export function zonedDaysBetween(from: Date, to: Date): number {
  const dayNumber = (value: Date) => {
    const p = zonedParts(value);
    return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
  };
  return dayNumber(to) - dayNumber(from);
}
