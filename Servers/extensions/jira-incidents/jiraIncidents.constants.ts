import {
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../domain.layer/enums/ai-incident-management.enum";

export const JIRA_INCIDENTS_KEY = "jira-incidents";
export const JIRA_INCIDENTS_RUN_KINDS = ["manual", "scheduled"] as const;
export const RUN_DEADLINE_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_SECONDS = 30;
export const IMPORT_OVERLAP_MINUTES = 10;
export const MAX_RETRY_AFTER_SECONDS = 10;
export const SEARCH_PAGE_SIZE = 50;
export const STATUS_BATCH_SIZE = 50;
/** A settled link (closed on both sides, no error) is re-read from Jira at most this often. */
export const SETTLED_RECHECK_HOURS = 24;
/** Remote links retried per run; a permanent failure (no LINK_ISSUES) must not eat the run. */
export const REMOTE_LINK_RETRY_LIMIT = 20;
export const EVENTS_DEFAULT_LIMIT = 50;
export const EVENTS_MAX_LIMIT = 200;
export const REQUIRED_PERMISSIONS = [
  "BROWSE_PROJECTS",
  "TRANSITION_ISSUES",
  "LINK_ISSUES",
] as const;
export const VW_STATUSES = Object.values(AIIncidentManagementStatus) as string[];
export const VW_SEVERITIES = Object.values(Severity) as string[];
export const INCIDENT_TYPES = Object.values(IncidentType) as string[];
export type LinkState = "ok" | "error" | "conflict" | "deleted_in_jira" | "deleted_in_verifywise";
export type EventKind =
  "imported" | "status_from_jira" | "status_to_jira" | "conflict" | "error" | "deleted_in_jira";
export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 32767;
export const TOKEN_REJECTED_MESSAGE =
  "Jira rejected the API token. It may have expired or been revoked.";
