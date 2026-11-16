import type { ReactNode } from "react";
import type { ExtensionRun } from "../../../../application/repository/extensionSync.repository";
import { describeRunCounts } from "../../../components/ExtensionSyncPanel/runCounts";

/** Same keys and order as the server's run summary (jiraIncidents.sync.ts). */
const PARTS: Array<{ key: string; one: string; many: string }> = [
  { key: "imported", one: "imported", many: "imported" },
  { key: "status_from_jira", one: "status from Jira", many: "statuses from Jira" },
  { key: "status_to_jira", one: "status to Jira", many: "statuses to Jira" },
  { key: "conflicts", one: "conflict", many: "conflicts" },
  { key: "errors", one: "error", many: "errors" },
  { key: "deleted_in_jira", one: "deleted in Jira", many: "deleted in Jira" },
];

/** "Sync completed: 2 imported, 1 status from Jira, 1 conflict" — non-zero counts only. */
export function describeJiraIncidentsRun(run: Pick<ExtensionRun, "counts">): ReactNode {
  const counts = run.counts ?? {};
  return describeRunCounts(
    PARTS.filter((p) => (counts[p.key] ?? 0) > 0).map((p) => ({
      count: counts[p.key],
      label: counts[p.key] === 1 ? p.one : p.many,
    })),
  );
}
