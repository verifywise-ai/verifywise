/**
 * @fileoverview Date helpers shared by the report collectors.
 *
 * @module services/reporting/dateUtils
 */

/**
 * ISO `YYYY-MM-DD`, or undefined when there is no usable date.
 *
 * EXPORTED deliberately: this is the report pipeline's ONE date
 * normalisation. The analyzers' facts substrate (§1/§3) hands the model a
 * reference date and asks it to compare due dates against it, so both sides of
 * that comparison must be sliced the same way or they disagree by a day.
 *
 * Locale-independent on purpose: `toLocaleDateString()` renders whatever the
 * server's locale happens to be. Built from LOCAL components rather than
 * `toISOString()` — pg hands back a DATE column as local midnight, and
 * UTC-shifting that reports the previous day anywhere west of Greenwich.
 */
export const isoDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
