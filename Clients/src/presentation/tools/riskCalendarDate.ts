/**
 * Risk deadlines and assessment dates are calendar days. The server stores a
 * picked day at exactly 12:00 UTC on that day; older rows may still hold a
 * browser's local midnight or another time.
 *
 * Returns the local midnight of the calendar day the value stands for, so the
 * date picker and every formatter show the same day in every time zone:
 * - exactly 12:00 UTC: the UTC date (reading the instant locally would show
 *   the next day from UTC+12 and drift forward on every save);
 * - anything else: the local date of the instant, as before.
 */
export const riskCalendarDay = (value: unknown): Date | null => {
  if (!value || (typeof value !== "string" && !(value instanceof Date))) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const isStoredNoon =
    date.getUTCHours() === 12 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return isStoredNoon
    ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
