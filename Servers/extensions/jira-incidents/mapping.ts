import { VW_SEVERITIES, VW_STATUSES } from "./jiraIncidents.constants";

export interface JiraStatus {
  id: string;
  name: string;
  categoryKey: string;
}
export interface JiraPriority {
  id: string;
  name: string;
}
export type StatusMapIn = Record<string, string>;
export type StatusMapOut = Record<string, string | null>;
export type SeverityMap = Record<string, string>;

const CATEGORY_TO_VW: Record<string, string> = {
  new: "Open",
  indeterminate: "Investigating",
  done: "Closed",
};
const VW_TO_CATEGORY: Record<string, string> = {
  Open: "new",
  Investigating: "indeterminate",
  Closed: "done",
};
const SEVERITY_BY_PRIORITY: Record<string, string> = {
  highest: "Very serious",
  high: "Very serious",
  medium: "Serious",
  low: "Minor",
  lowest: "Minor",
};
const DEFAULT_SEVERITY = "Serious";

export function defaultStatusMapIn(statuses: JiraStatus[]): StatusMapIn {
  return Object.fromEntries(statuses.map((s) => [s.id, CATEGORY_TO_VW[s.categoryKey] ?? "Open"]));
}

export function defaultStatusMapOut(statuses: JiraStatus[]): StatusMapOut {
  return Object.fromEntries(
    VW_STATUSES.map((vw) => {
      const category = VW_TO_CATEGORY[vw];
      const first = category ? statuses.find((s) => s.categoryKey === category) : undefined;
      return [vw, first ? first.id : null];
    }),
  );
}

export function defaultSeverityFor(priorityName: string): string {
  return SEVERITY_BY_PRIORITY[priorityName.trim().toLowerCase()] ?? DEFAULT_SEVERITY;
}

export function defaultSeverityMap(priorities: JiraPriority[]): SeverityMap {
  return Object.fromEntries(priorities.map((p) => [p.id, defaultSeverityFor(p.name)]));
}

export function severityForPriority(
  map: SeverityMap,
  priorityId: string | null | undefined,
): string {
  return (priorityId && map[priorityId]) || DEFAULT_SEVERITY;
}

export function unmappedStatuses(statuses: JiraStatus[], map: StatusMapIn): JiraStatus[] {
  return statuses.filter((s) => !map[s.id]);
}

const JIRA_ID = /^\d{1,18}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Null when valid; otherwise the first problem, in plain language. */
export function validateMaps(maps: {
  statusMapIn: unknown;
  statusMapOut: unknown;
  severityMap: unknown;
}): string | null {
  const { statusMapIn, statusMapOut, severityMap } = maps;
  if (!isPlainObject(statusMapIn) || !isPlainObject(statusMapOut) || !isPlainObject(severityMap)) {
    return "Mappings must be objects";
  }
  for (const [jiraId, value] of Object.entries(statusMapIn)) {
    if (!JIRA_ID.test(jiraId)) return `Invalid Jira status id '${jiraId}'`;
    if (typeof value !== "string" || !VW_STATUSES.includes(value))
      return `Unknown VerifyWise status '${String(value)}'`;
  }
  for (const [vw, jiraId] of Object.entries(statusMapOut)) {
    if (!VW_STATUSES.includes(vw)) return `Unknown VerifyWise status '${vw}'`;
    if (jiraId !== null && (typeof jiraId !== "string" || !JIRA_ID.test(jiraId)))
      return `Invalid Jira status for '${vw}'`;
  }
  for (const [jiraId, value] of Object.entries(severityMap)) {
    if (!JIRA_ID.test(jiraId)) return `Invalid Jira priority id '${jiraId}'`;
    if (typeof value !== "string" || !VW_SEVERITIES.includes(value))
      return `Unknown severity '${String(value)}'`;
  }
  return null;
}
