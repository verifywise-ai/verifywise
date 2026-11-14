/**
 * risks.deadline and risks.date_of_assessment are TIMESTAMP WITH TIME ZONE
 * columns that hold calendar dates. Every calendar date is stored at 12:00 UTC
 * on its day: noon UTC falls on the same day in every time zone from UTC-11 to
 * UTC+11, so the date reads the same for every viewer.
 *
 * - A date-only value ("2026-05-01") is stored at noon UTC on that day. The
 *   risk form sends this.
 * - A value that looks like a browser's local midnight (a whole quarter hour,
 *   no seconds) is snapped to noon UTC on the nearest day: 05:00Z from Toronto
 *   and 21:00Z the evening before from Istanbul both become noon on the picked
 *   day. 00:00Z (a date-only value something already parsed) is the same case.
 *   Older clients and API callers send these.
 * - Any other time, such as "now" with seconds, is kept as it is.
 *
 * The stored time cannot tell UTC+12..+14 from UTC-12..-10, so a local
 * midnight from those zones can land a day off, as before.
 *
 * Migration 20261114120000 applies the same rule to existing rows.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR_MS = 3600 * 1000;

const noonUtc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day, 12));

const looksLikeLocalMidnight = (date: Date): boolean =>
  date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0 && date.getUTCMinutes() % 15 === 0;

/**
 * Normalises a risk calendar date for storage. undefined, null and "" pass
 * through unchanged, and so does anything that does not parse, so existing
 * validation and errors behave as before.
 */
export function toRiskCalendarDate<T>(value: T): T | Date {
  if (value === undefined || value === null || value === "") return value;

  if (typeof value === "string" && DATE_ONLY.test(value.trim())) {
    const [year, month, day] = value.trim().split("-").map(Number);
    const date = noonUtc(year, month - 1, day);
    // Date.UTC rolls 2026-02-30 over to March; leave such a value for validation.
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : value;
  }

  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "string") date = new Date(value.trim());
  else return value;

  if (Number.isNaN(date.getTime()) || !looksLikeLocalMidnight(date)) return value;
  if (date.getUTCHours() === 12 && date.getUTCMinutes() === 0) return date;

  // Nearest UTC midnight: local midnights from UTC-11 to UTC+12 are within 12 hours of it.
  const nearest = new Date(date.getTime() + 12 * HOUR_MS);
  return noonUtc(nearest.getUTCFullYear(), nearest.getUTCMonth(), nearest.getUTCDate());
}
