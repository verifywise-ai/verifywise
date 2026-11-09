/**
 * Pure parts of the simulated Jira Cloud: state, JQL parsing, time zone
 * arithmetic and the paging token. Not loaded by the application.
 */

export interface MockIssue {
  id: string;
  key: string;
  projectId: string;
  issueTypeId: string;
  summary: string;
  description: unknown;
  priorityId: string | null;
  labels: string[];
  statusId: string;
  created: string; // ISO with offset, e.g. "2026-10-14T10:00:00.000+0000"
  statusChangedAt: string; // ISO; also emitted as the latest changelog entry
  remoteLinks: Array<{ globalId: string; url: string; title: string }>;
  deleted: boolean;
}

export interface MockState {
  account: { accountId: string; emailAddress: string; timeZone: string };
  token: string;
  email: string;
  permissions: Record<string, boolean>; // BROWSE_PROJECTS, TRANSITION_ISSUES, LINK_ISSUES
  projectReadable: boolean;
  project: { id: string; key: string; name: string };
  issueTypes: Array<{ id: string; name: string }>;
  statuses: Array<{ id: string; name: string; categoryKey: string }>;
  transitions: Array<{ id: string; name: string; toStatusId: string; requiredFields: string[] }>;
  priorities: Array<{ id: string; name: string }>;
  labels: string[];
  issues: MockIssue[];
  failNext: Array<{
    status: 401 | 403 | 429 | 500 | 503;
    retryAfter?: number;
    path?: string;
    afterCalls?: number;
  }>;
  blockedTransitions: string[];
  calls: Array<{ method: string; path: string; body?: unknown }>;
}

export function defaultState(): MockState {
  return {
    account: { accountId: "svc-1", emailAddress: "svc@acme.test", timeZone: "UTC" },
    email: "svc@acme.test",
    token: "token-1",
    permissions: { BROWSE_PROJECTS: true, TRANSITION_ISSUES: true, LINK_ISSUES: true },
    projectReadable: true,
    project: { id: "10000", key: "SEC", name: "Security" },
    issueTypes: [{ id: "10001", name: "Incident" }],
    statuses: [
      { id: "1", name: "To Do", categoryKey: "new" },
      { id: "3", name: "In Progress", categoryKey: "indeterminate" },
      { id: "4", name: "Done", categoryKey: "done" },
    ],
    transitions: [
      { id: "11", name: "Start", toStatusId: "3", requiredFields: [] },
      { id: "12", name: "Reopen", toStatusId: "1", requiredFields: [] },
      { id: "13", name: "Close", toStatusId: "4", requiredFields: [] },
    ],
    priorities: [
      { id: "2", name: "High" },
      { id: "3", name: "Medium" },
      { id: "4", name: "Low" },
    ],
    labels: ["ai", "ai-risk"],
    issues: [],
    failNext: [],
    blockedTransitions: [],
    calls: [],
  };
}

export type ParsedJql =
  | {
      kind: "import";
      projectId: string;
      issueTypeId: string;
      label: string | null;
      createdFrom: string;
    }
  | { kind: "ids"; ids: string[] };

const IMPORT_JQL =
  /^project = (\d+) AND issuetype = (\d+)(?: AND labels = "([^"]*)")? AND created >= "(\d{4}-\d{2}-\d{2} \d{2}:\d{2})" ORDER BY created ASC$/;
const IDS_JQL = /^id in \((\d+(?:\s*,\s*\d+)*)\)$/;

/** Parses only the JQL forms the extension builds; throws on anything else. */
export function parseJql(jql: string): ParsedJql {
  const text = (jql ?? "").trim();
  const imp = IMPORT_JQL.exec(text);
  if (imp) {
    return {
      kind: "import",
      projectId: imp[1],
      issueTypeId: imp[2],
      label: imp[3] ?? null,
      createdFrom: imp[4],
    };
  }
  const ids = IDS_JQL.exec(text);
  if (ids) return { kind: "ids", ids: ids[1].split(",").map((s) => s.trim()) };
  throw new Error(`Mock Jira does not understand this JQL: ${jql}`);
}

/** Inverse of formatJqlDate: a wall-clock "yyyy-MM-dd HH:mm" in `timeZone` to an instant. */
export function zonedMinuteToInstant(local: string, timeZone: string): Date {
  const [d, t] = local.split(" ");
  const asUtc = new Date(`${d}T${t}:00Z`).getTime();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  // Zone offset (ms) in force at an instant.
  const offsetAt = (instant: number): number => {
    const parts = fmt.formatToParts(new Date(instant));
    const g = (k: string) => parts.find((p) => p.type === k)!.value;
    return (
      Date.parse(`${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:00Z`) - instant
    );
  };
  // Two passes: the offset at the wall-clock-as-UTC instant can differ from the
  // offset at the real instant when a DST change falls in between.
  const guess = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(guess));
}

/** "2026-10-14T10:00:00.000+0000" to a Date ("+0000" is not parseable everywhere). */
export function parseJiraTimestamp(value: string): Date {
  return new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

export function toJiraTimestamp(date: Date): string {
  return date.toISOString().replace("Z", "+0000");
}

export const encodePageToken = (start: number): string =>
  Buffer.from(String(start)).toString("base64");

export function decodePageToken(token: unknown): number {
  if (token === undefined || token === null || token === "") return 0;
  const n = Number(Buffer.from(String(token), "base64").toString("utf8"));
  if (!Number.isInteger(n) || n < 0) throw new Error("Invalid nextPageToken");
  return n;
}
