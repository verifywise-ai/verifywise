/**
 * Paging for the change-history endpoints that validate it (use cases,
 * incidents): a bad limit or offset is a 400, not a silent default.
 */

/** The most history entries one request returns (the client asks for 100). */
export const MAX_HISTORY_LIMIT = 100;

/**
 * A paging field: `fallback` when absent, null when it is not a whole number
 * from `min` to `max`. A repeated field is invalid.
 */
export const historyPageNumber = (
  raw: unknown,
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number | null => {
  if (raw === undefined || raw === "") return fallback;
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
};
