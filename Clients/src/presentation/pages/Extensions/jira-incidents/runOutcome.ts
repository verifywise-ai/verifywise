import type { ExtensionRun } from "../../../../application/repository/extensionSync.repository";
import {
  describeRunCounts,
  type RunCountPart,
  type Translate,
} from "../../../components/ExtensionSyncPanel/runCounts";

/** Same keys and order as the server's run summary (jiraIncidents.run.ts). */
const PARTS: Array<Omit<RunCountPart, "count"> & { key: string }> = [
  { key: "imported", one: "{count} incident imported", other: "{count} incidents imported" },
  {
    key: "status_from_jira",
    one: "{count} status from Jira",
    other: "{count} statuses from Jira",
  },
  { key: "status_to_jira", one: "{count} status to Jira", other: "{count} statuses to Jira" },
  { key: "conflicts", one: "{count} conflict", other: "{count} conflicts" },
  { key: "errors", one: "{count} error", other: "{count} errors" },
  {
    key: "deleted_in_jira",
    one: "{count} issue deleted in Jira",
    other: "{count} issues deleted in Jira",
  },
];

/** "Sync completed: 2 incidents imported, 1 status from Jira, 1 conflict" — non-zero counts only. */
export function describeJiraIncidentsRun(
  run: Pick<ExtensionRun, "counts">,
  t: Translate,
  lang: string,
): string {
  const counts = run.counts ?? {};
  return describeRunCounts(
    PARTS.map(({ key, one, other }) => ({ count: counts[key] ?? 0, one, other })),
    t,
    lang,
  );
}
