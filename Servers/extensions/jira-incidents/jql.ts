import { IMPORT_OVERLAP_MINUTES } from "./jiraIncidents.constants";

const NUMERIC_ID = /^\d{1,18}$/;

export function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** `yyyy-MM-dd HH:mm` in `timeZone` (Jira reads JQL dates in the searcher's zone), rounded down. */
export function formatJqlDate(at: Date, timeZone: string): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  };
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

export function importCutoff(importFrom: Date, lastCheckedAt: Date | null): Date {
  if (!lastCheckedAt) return importFrom;
  const overlap = new Date(lastCheckedAt.getTime() - IMPORT_OVERLAP_MINUTES * 60_000);
  return overlap > importFrom ? overlap : importFrom;
}

export function buildImportJql(p: {
  projectId: string;
  issueTypeId: string;
  label: string | null;
  cutoff: string;
}): string {
  if (!NUMERIC_ID.test(p.projectId)) throw new Error("Invalid Jira project id");
  if (!NUMERIC_ID.test(p.issueTypeId)) throw new Error("Invalid Jira issue type id");
  const label = p.label?.trim() ? ` AND labels = "${escapeJqlString(p.label.trim())}"` : "";
  return `project = ${p.projectId} AND issuetype = ${p.issueTypeId}${label} AND created >= "${p.cutoff}" ORDER BY created ASC`;
}

export function buildIdsJql(ids: string[]): string {
  if (ids.length === 0 || ids.some((id) => !NUMERIC_ID.test(id)))
    throw new Error("Invalid Jira issue ids");
  return `id in (${ids.join(",")})`;
}
