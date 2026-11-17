/** Days ahead that still count as "due soon" in the queue. */
export const DUE_SOON_DAYS = 14;

/** `YYYY-MM-DD` of `isoDate` plus `days`, in UTC (the queue's date-only rule). */
export const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * SQL for the UTC calendar day of a TIMESTAMPTZ column as `YYYY-MM-DD`, so the
 * session or driver time zone can never shift the day.
 */
export const utcDateSql = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

/** Same for a plain TIMESTAMP column (no zone to convert). */
export const dateSql = (column: string): string => `to_char(${column}, 'YYYY-MM-DD')`;

export const toIso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;
