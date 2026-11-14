/**
 * risks.deadline and risks.date_of_assessment are TIMESTAMP WITH TIME ZONE
 * columns that hold calendar dates. A calendar date is stored at 12:00 UTC on
 * its day; the client reads exactly 12:00 UTC as that UTC date
 * (Clients/src/presentation/tools/riskCalendarDate.ts), so every viewer sees
 * the same day.
 *
 * Only unambiguous date-only input is normalised:
 * - a "YYYY-MM-DD" string (the risk form sends this);
 * - a value at exactly 00:00:00.000 UTC, which is how a date-only value looks
 *   once something has parsed it (the advisor, an import cell, a JSON client).
 * Any other time is stored as sent, so an explicit API or MCP timestamp keeps
 * its meaning.
 *
 * Migration 20261114120000 moved existing rows that look like a browser's
 * local midnight to noon UTC.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const noonUtc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day, 12));

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

  const isUtcMidnight =
    !Number.isNaN(date.getTime()) &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return isUtcMidnight
    ? noonUtc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : value;
}
