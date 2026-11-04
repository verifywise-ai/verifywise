/**
 * Column limits of shadow_ai_events, shared by the REST and syslog ingestion
 * paths. Free of database imports so the syslog parsers stay pure.
 */

/**
 * Character widths of the shadow_ai_events columns (tenant-tables migration).
 * uri_path is TEXT; its bound keeps rows small.
 */
export const SHADOW_AI_EVENT_LIMITS = {
  user_email: 255,
  destination: 512,
  uri_path: 2048,
  http_method: 10,
  action: 50,
  detected_model: 255,
  department: 255,
  job_title: 255,
  manager_email: 255,
} as const;

type StoredEventRow = {
  user_email: string;
  destination: string;
  uri_path?: string;
  http_method?: string;
  action: string;
  detected_model?: string;
  event_timestamp: Date;
  department?: string;
  job_title?: string;
  manager_email?: string;
};

/**
 * Whether a row can be inserted: every string fits its column and has no NUL,
 * and the timestamp is a real date. One row that does not fit fails the whole
 * multi-row INSERT, so callers check every row first.
 */
export function eventRowFitsColumns(row: StoredEventRow): boolean {
  for (const [column, max] of Object.entries(SHADOW_AI_EVENT_LIMITS)) {
    const value = row[column as keyof StoredEventRow];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return false;
    if (value.includes("\u0000") || [...value].length > max) return false;
  }
  const time = row.event_timestamp?.getTime();
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15;
}
