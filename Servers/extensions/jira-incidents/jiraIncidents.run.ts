import type { JiraIncidentsClient } from "./jiraIncidents.client";
import type { JiraIncidentsConfig } from "./jiraIncidents.config";

export type CountKey =
  "imported" | "status_from_jira" | "status_to_jira" | "conflicts" | "errors" | "deleted_in_jira";

/** State shared by the import and status-sync steps of one run. */
export interface RunState {
  orgId: number;
  runId: number | null;
  startedAt: Date;
  config: JiraIncidentsConfig;
  client: JiraIncidentsClient;
  counts: Record<CountKey, number>;
  /** Set when the run stopped early. */
  stopReason: string | null;
  heartbeat: () => Promise<void>;
  deadline: AbortSignal;
  warnedNoFrontendUrl: boolean;
  /** Links imported by this run; their remote link is not retried in the same run. */
  importedLinkIds?: number[];
  /** Re-read settled links too (a manual run); otherwise they wait SETTLED_RECHECK_HOURS. */
  recheckSettled?: boolean;
  /** Jira status id -> name; filled by the status-sync step. */
  statusNames?: Map<string, string>;
}

export function newCounts(): Record<CountKey, number> {
  return {
    imported: 0,
    status_from_jira: 0,
    status_to_jira: 0,
    conflicts: 0,
    errors: 0,
    deleted_in_jira: 0,
  };
}

export const STOP_DEADLINE =
  "Stopped at the time limit. The next sync continues where this one stopped.";
export const STOP_RATE_LIMIT =
  "Rate limited by Jira. The next sync continues where this one stopped.";
