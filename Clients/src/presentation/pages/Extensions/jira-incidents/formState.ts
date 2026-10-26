import type {
  JiraIncidentsConfigInput,
  JiraIncidentsConfigView,
} from "../../../../application/repository/jiraIncidents.repository";
import {
  IncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../../../domain/enums/aiIncidentManagement.enum";

export const VW_STATUSES: readonly string[] = Object.values(IncidentManagementStatus);
export const SEVERITIES: readonly string[] = Object.values(Severity);
export const INCIDENT_TYPES: readonly string[] = Object.values(IncidentType);
/** Select value for a VerifyWise status that leaves the Jira issue as it is (null on the server). */
export const DONT_CHANGE_JIRA = "__dont_change__";

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const REPORTER_MAX = 255;

export interface FormState {
  site_url: string;
  email: string;
  api_token: string;
  project_id: string;
  project_key: string;
  issue_type_id: string;
  label: string;
  status_map_in: Record<string, string>;
  status_map_out: Record<string, string | null>;
  severity_map: Record<string, string>;
  default_project_id: number | "";
  default_type: string;
  default_reporter: string;
}

export function fromView(view: JiraIncidentsConfigView): FormState {
  return {
    site_url: view.site_url ?? "",
    email: view.email ?? "",
    api_token: "",
    project_id: view.project_id ?? "",
    project_key: view.project_key ?? "",
    issue_type_id: view.issue_type_id ?? "",
    label: view.label ?? "",
    status_map_in: { ...view.status_map_in },
    status_map_out: Object.fromEntries(
      Object.entries(view.status_map_out).map(([k, v]) => [k, v ?? DONT_CHANGE_JIRA]),
    ),
    severity_map: { ...view.severity_map },
    default_project_id: view.default_project_id ?? "",
    default_type: view.default_type ?? "",
    default_reporter: view.default_reporter ?? "",
  };
}

/** Saved values whose key is still current, the default for the rest; keys no longer offered are dropped. */
function mergeByKey<T>(
  saved: Record<string, T>,
  defaults: Record<string, T>,
  keys: readonly string[],
): Record<string, T> {
  return Object.fromEntries(
    keys.map((k) => [k, k in saved ? saved[k] : defaults[k]]).filter(([, v]) => v !== undefined),
  );
}

export function withStatusDefaults(
  form: FormState,
  defaults: {
    default_map_in: Record<string, string>;
    default_map_out: Record<string, string | null>;
  },
  statusIds: string[],
): FormState {
  const current = new Set(statusIds);
  const keptOut = Object.fromEntries(
    Object.entries(form.status_map_out).filter(
      ([, v]) => v === DONT_CHANGE_JIRA || (v !== null && current.has(v)),
    ),
  );
  const defaultsOut = Object.fromEntries(
    Object.entries(defaults.default_map_out).map(([k, v]) => [k, v ?? DONT_CHANGE_JIRA]),
  );
  return {
    ...form,
    status_map_in: mergeByKey(form.status_map_in, defaults.default_map_in, statusIds),
    status_map_out: mergeByKey(keptOut, defaultsOut, VW_STATUSES),
  };
}

export function withSeverityDefaults(
  form: FormState,
  defaults: Record<string, string>,
  priorityIds: string[],
): FormState {
  return { ...form, severity_map: mergeByKey(form.severity_map, defaults, priorityIds) };
}

export function validateForm(
  form: FormState,
  opts: {
    hasStoredToken: boolean;
    storedSiteUrl: string | null;
    storedEmail: string | null;
    statusIds: string[];
  },
): Record<string, string> {
  // Projects, statuses and priorities load only after a saved connection, so
  // the first save checks the connection fields alone.
  const connectionOnly = !opts.hasStoredToken;
  const errors: Record<string, string> = {};
  const site = form.site_url.trim();
  const email = form.email.trim();
  if (!site) errors.site_url = "Enter your Jira site URL";
  if (!EMAIL.test(email)) errors.email = "Enter the service account email";
  if (!form.api_token.trim()) {
    const changed = site !== (opts.storedSiteUrl ?? "") || email !== (opts.storedEmail ?? "");
    if (!opts.hasStoredToken) errors.api_token = "Enter the API token";
    else if (changed)
      errors.api_token = "Enter the API token again after changing the site URL or email";
  }
  if (connectionOnly) return errors;
  if (!form.project_id) errors.project_id = "Choose a project";
  if (!form.issue_type_id) errors.issue_type_id = "Choose an issue type";
  if (opts.statusIds.some((id) => !form.status_map_in[id])) {
    errors.status_map_in = "Map every Jira status";
  }
  if (form.default_project_id === "") errors.default_project_id = "Choose a use case";
  if (!form.default_type) errors.default_type = "Choose an incident type";
  const reporter = form.default_reporter.trim();
  if (!reporter || reporter.length > REPORTER_MAX) errors.default_reporter = "Enter the reporter";
  return errors;
}

/**
 * The PUT body: "Don't change Jira" as null, blank label as null. Fields not
 * filled in yet (token, project, issue type, defaults) are left out, so the
 * server keeps what it has instead of rejecting an empty value.
 */
export function toInput(form: FormState): JiraIncidentsConfigInput {
  const input: JiraIncidentsConfigInput = {
    site_url: form.site_url.trim(),
    email: form.email.trim(),
    label: form.label.trim() || null,
    status_map_in: form.status_map_in,
    status_map_out: Object.fromEntries(
      Object.entries(form.status_map_out).map(([k, v]) => [k, v === DONT_CHANGE_JIRA ? null : v]),
    ),
    severity_map: form.severity_map,
  };
  const optional = {
    api_token: form.api_token.trim(),
    project_id: form.project_id,
    project_key: form.project_key,
    issue_type_id: form.issue_type_id,
    default_type: form.default_type,
    default_reporter: form.default_reporter.trim(),
  };
  for (const [key, value] of Object.entries(optional) as Array<[keyof typeof optional, string]>) {
    if (value) input[key] = value;
  }
  if (form.default_project_id !== "") input.default_project_id = form.default_project_id;
  return input;
}
