import type { ExtensionRun } from "../../../../application/repository/extensionSync.repository";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Same keys and order as the server's run summary (jiraIncidents.sync.ts). */
const PARTS: Array<{ key: string; label: (n: number) => string }> = [
  { key: "imported", label: (n) => `imported ${n}` },
  { key: "status_from_jira", label: (n) => `${plural(n, "status", "statuses")} from Jira` },
  { key: "status_to_jira", label: (n) => `${plural(n, "status", "statuses")} to Jira` },
  { key: "conflicts", label: (n) => plural(n, "conflict", "conflicts") },
  { key: "errors", label: (n) => plural(n, "error", "errors") },
  { key: "deleted_in_jira", label: (n) => `${n} deleted in Jira` },
];

/** "Sync completed: imported 2, 1 status from Jira, 1 conflict" — non-zero counts only. */
export function describeJiraIncidentsRun(run: Pick<ExtensionRun, "counts">): string {
  const counts = run.counts ?? {};
  const parts = PARTS.filter((p) => (counts[p.key] ?? 0) > 0).map((p) => p.label(counts[p.key]));
  return `Sync completed: ${parts.length > 0 ? parts.join(", ") : "no changes"}`;
}
