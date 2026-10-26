import { apiServices } from "../../infrastructure/api/networkServices";
import { testExtensionConnection } from "./extension.repository";

/**
 * The Jira incidents extension's routes
 * (Servers/extensions/jira-incidents/jiraIncidents.route.ts). Everything is
 * Admin only except the links read behind the incident chips.
 */

const BASE = "/extensions/jira-incidents";
const KEY = "jira-incidents";
/** The server's cap on incident ids per links request. */
const LINK_IDS_PER_REQUEST = 500;

export type LinkState = "ok" | "error" | "conflict" | "deleted_in_jira" | "deleted_in_verifywise";

export interface JiraIncidentsConfigView {
  configured: boolean;
  site_url: string | null;
  email: string | null;
  has_api_token: boolean;
  service_account_id: string | null;
  service_account_time_zone: string | null;
  project_id: string | null;
  project_key: string | null;
  issue_type_id: string | null;
  label: string | null;
  status_map_in: Record<string, string>;
  status_map_out: Record<string, string | null>;
  severity_map: Record<string, string>;
  default_project_id: number | null;
  default_type: string | null;
  default_reporter: string | null;
  import_from: string | null;
  last_checked_at: string | null;
  readiness: { ready: boolean; reason: string | null };
}

export interface JiraIncidentsConfigInput {
  site_url?: string;
  email?: string;
  api_token?: string;
  project_id?: string;
  project_key?: string;
  issue_type_id?: string;
  label?: string | null;
  status_map_in?: Record<string, string>;
  status_map_out?: Record<string, string | null>;
  severity_map?: Record<string, string>;
  default_project_id?: number;
  default_type?: string;
  default_reporter?: string;
}

export interface JiraStatusOption {
  id: string;
  name: string;
  categoryKey: string;
}

export interface JiraIncidentLink {
  incident_id: number;
  jira_issue_key: string;
  jira_url: string;
  state: LinkState;
  state_reason: string | null;
}

export interface JiraIncidentEvent {
  id: number;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
  incident_id: number | null;
  incident_code: string | null;
  jira_issue_key: string | null;
  jira_url: string | null;
}

async function getData<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await apiServices.get(`${BASE}${path}`, params);
  return (response.data as { data: T }).data;
}

export async function getJiraIncidentsConfig(): Promise<JiraIncidentsConfigView> {
  return getData("/config");
}

export async function saveJiraIncidentsConfig(
  input: JiraIncidentsConfigInput,
): Promise<JiraIncidentsConfigView> {
  const response = await apiServices.put(`${BASE}/config`, input);
  return (response.data as { data: JiraIncidentsConfigView }).data;
}

export async function testJiraIncidentsConnection(input: {
  site_url?: string;
  email?: string;
  api_token?: string;
  project_id?: string;
}): Promise<{ success: boolean; message: string }> {
  return testExtensionConnection({ key: KEY, configuration: input });
}

export async function getJiraProjects(): Promise<Array<{ id: string; key: string; name: string }>> {
  return getData("/jira/projects");
}

export async function getJiraIssueTypes(
  projectId: string,
): Promise<Array<{ id: string; name: string }>> {
  return getData("/jira/issue-types", { project: projectId });
}

export async function getJiraStatuses(
  projectId: string,
  issueTypeId: string,
): Promise<{
  statuses: JiraStatusOption[];
  default_map_in: Record<string, string>;
  default_map_out: Record<string, string | null>;
}> {
  return getData("/jira/statuses", { project: projectId, issue_type: issueTypeId });
}

export async function getJiraPriorities(): Promise<{
  priorities: Array<{ id: string; name: string }>;
  default_severity_map: Record<string, string>;
}> {
  return getData("/jira/priorities");
}

export async function getJiraLabels(query: string): Promise<string[]> {
  return getData("/jira/labels", { query });
}

export async function getJiraIncidentEvents(limit?: number): Promise<JiraIncidentEvent[]> {
  return getData("/events", limit === undefined ? {} : { limit });
}

/** Links for the given incidents, in requests of at most 500 ids; no request for an empty list. */
export async function getJiraIncidentLinks(incidentIds: number[]): Promise<JiraIncidentLink[]> {
  if (incidentIds.length === 0) return [];
  const chunks: number[][] = [];
  for (let i = 0; i < incidentIds.length; i += LINK_IDS_PER_REQUEST) {
    chunks.push(incidentIds.slice(i, i + LINK_IDS_PER_REQUEST));
  }
  const results = await Promise.all(
    chunks.map((ids) =>
      getData<JiraIncidentLink[]>("/links", {
        incident_ids: ids.join(","),
        suppressGlobalErrorToast: true,
      }),
    ),
  );
  return results.flat();
}
