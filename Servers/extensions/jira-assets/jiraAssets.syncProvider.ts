import type { SyncProvider } from "../sync-engine/types";
import { WORKER_SYNC_DEADLINE_MS } from "./jira.client";
import {
  JIRA_ASSETS_KEY,
  JIRA_RUN_KINDS,
  jiraCanSchedule,
  jiraReadiness,
  runJiraSync,
} from "./jiraAssets.service";

/**
 * Jira Assets on the sync engine. One claim per org covers every exclusive
 * operation: manual and scheduled syncs, import, and removal (remove-missing
 * and the single use-case delete, both recorded as remove_missing).
 */
export const jiraAssetsSyncProvider: SyncProvider = {
  key: JIRA_ASSETS_KEY,
  displayName: "Jira Assets",
  kinds: JIRA_RUN_KINDS,
  scheduledKind: "scheduled",
  runDeadlineMs: WORKER_SYNC_DEADLINE_MS,
  readiness: jiraReadiness,
  canSchedule: jiraCanSchedule,
  run: runJiraSync,
};
