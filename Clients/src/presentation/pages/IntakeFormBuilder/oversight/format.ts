/** Whole-number percentage of part in whole, or null when whole is zero. */
export function percent(part: number, whole: number): number | null {
  if (!whole || whole < 0) return null;
  return Math.round((part / whole) * 100);
}

/** Hours as days with one decimal ("0.9"), or null when there is no figure. */
export function hoursToDays(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return null;
  return (hours / 24).toFixed(1);
}
