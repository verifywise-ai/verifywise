/**
 * risks.deadline and risks.date_of_assessment are TIMESTAMP WITH TIME ZONE
 * columns that hold calendar dates. A calendar date is stored at 12:00 UTC on
 * its day; the client reads exactly 12:00 UTC as that UTC date
 * (riskCalendarDay in Clients/src/presentation/tools/isoDateToString.ts), so
 * every viewer sees the same day.
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
/** ISO date forms without a day or time ("2026", "2026-05"): JavaScript parses these as UTC. */
const ISO_PARTIAL_DATE = /^\d{4}(-\d{2})?$/;
/** A time of day ("18:00") or an ISO date-time ("2026-05-01T18"). Weekday names do not match. */
const HAS_TIME = /\d:\d|\dT\d/;

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

/**
 * A risk date from a spreadsheet cell. Date cells and ISO strings follow
 * toRiskCalendarDate. Other text without a time is a calendar day:
 * "2026" and "2026-05" parse as UTC midnight, and anything else ("05/01/2026",
 * "Thu 1 Oct 2026") as the server's local midnight, so the date is read in
 * that same zone. Numbers are rejected by validation (isInvalidDateCell).
 */
export function riskCalendarDateFromCell<T>(value: T): T | Date {
  if (typeof value !== "string") return toRiskCalendarDate(value);
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed) || HAS_TIME.test(trimmed)) return toRiskCalendarDate(value);

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return value;
  return ISO_PARTIAL_DATE.test(trimmed)
    ? noonUtc(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
    : noonUtc(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Whether a spreadsheet cell cannot be a risk date. A number is refused: a
 * cell in General format holds an Excel serial (46022) or a typed year
 * (2026), and reading either as a timestamp would store a 1970 date.
 */
export function isInvalidDateCell(value: unknown): boolean {
  if (typeof value === "number") return true;
  return Number.isNaN(new Date(value as string | Date).getTime());
}
