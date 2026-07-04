/** Convert an ISO date/string to the yyyy-mm-dd value a native date input expects. */
export const toIsoDateInput = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

/**
 * Compact relative-time label used on the Monitoring tab (e.g. "2h ago", "1d ago",
 * "just now"). Falls back to an em dash for missing/invalid input. Keeps the copy
 * short and matches the mockup's "last received" column.
 */
export const relativeTime = (value?: string | null): string => {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};
