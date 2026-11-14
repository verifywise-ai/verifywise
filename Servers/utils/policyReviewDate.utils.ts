/**
 * A policy's next review date is a calendar day, stored at midnight in a
 * TIMESTAMP (no time zone) column. node-pg reads such a value as the server's
 * local midnight, so reading the raw column gives a different instant on every
 * server time zone (a day early in UTC terms east of UTC). These helpers keep
 * the day intact on any server time zone (audit P-M1).
 */

/**
 * SELECT expression returning the review date as "YYYY-MM-DDT00:00:00.000Z",
 * the value a UTC backend has always returned. `pm` must alias policy_manager.
 */
export const POLICY_REVIEW_DATE_SQL =
  'to_char(pm.next_review_date, \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') AS next_review_date';

const REVIEW_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * True for an exact "YYYY-MM-DD" or a full ISO timestamp, with a real
 * calendar day and an in-range time. A valid date followed by anything else
 * ("2030-01-15garbage", "2030-01-15T25:99:99") is refused.
 */
export const isReviewDateString = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = REVIEW_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [y, m, d, hh, mm, ss] = match.slice(1, 7).map((part) => Number(part ?? 0));
  if (hh > 23 || mm > 59 || ss > 59) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * The value to store: the calendar day "YYYY-MM-DD" (stored at midnight), or
 * null for none. A full ISO timestamp keeps its date part. Anything else is
 * passed through unchanged, so PostgreSQL rejects it instead of a valid
 * prefix being stored.
 */
export const toReviewDateValue = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? value : value.toISOString().slice(0, 10);
  }
  if (isReviewDateString(value)) return value.slice(0, 10);
  return value;
};

/**
 * The review date for emails and messages, e.g. "January 15, 2030".
 * A string (from a POLICY_REVIEW_DATE_SQL read) is read in UTC. A Date (a raw
 * node-pg read) is read by its local date parts, which hold the stored day.
 */
export const formatReviewDate = (value: unknown): string => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toLocaleDateString("en-US", { dateStyle: "long" });
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    });
  }
  return "";
};
