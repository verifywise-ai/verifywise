import type { SyncProvider } from "../sync-engine/types";
import {
  JIRA_INCIDENTS_KEY,
  JIRA_INCIDENTS_RUN_KINDS,
  RUN_DEADLINE_MS,
} from "./jiraIncidents.constants";
import { jiraIncidentsReadiness } from "./jiraIncidents.config";
import { runJiraIncidentsSync } from "./jiraIncidents.sync";

/** Jira incidents on the sync engine: import new issues, then sync status both ways. */
export const jiraIncidentsSyncProvider: SyncProvider = {
  key: JIRA_INCIDENTS_KEY,
  displayName: "Jira incidents",
  kinds: JIRA_INCIDENTS_RUN_KINDS,
  scheduledKind: "scheduled",
  runDeadlineMs: RUN_DEADLINE_MS,
  readiness: jiraIncidentsReadiness,
  run: runJiraIncidentsSync,
};
