import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { decrypt, encrypt } from "../../utils/encryption.utils";
import logger from "../../utils/logger/fileLogger";
import type { Readiness } from "../sync-engine/types";
import { INCIDENT_TYPES, JIRA_INCIDENTS_KEY, VW_STATUSES } from "./jiraIncidents.constants";
import { JiraAuthError, JiraHttpError, JiraUnreachableError } from "./jiraIncidents.errors";
import { JiraIncidentsClient } from "./jiraIncidents.client";
import { SeverityMap, StatusMapIn, StatusMapOut, unmappedStatuses, validateMaps } from "./mapping";
import { JiraIncidentsValidationError, normalizeSiteUrl } from "./siteUrl";

export interface JiraIncidentsConfig {
  organizationId: number;
  siteUrl: string | null;
  email: string | null;
  apiToken: string | null;
  serviceAccountId: string | null;
  serviceAccountTimeZone: string | null;
  projectId: string | null;
  projectKey: string | null;
  issueTypeId: string | null;
  label: string | null;
  statusMapIn: StatusMapIn;
  statusMapOut: StatusMapOut;
  severityMap: SeverityMap;
  defaultProjectId: number | null;
  defaultProjectName: string | null;
  defaultType: string | null;
  defaultReporter: string | null;
  importFrom: Date | null;
  lastCheckedAt: Date | null;
}

export interface ConfigView {
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
  status_map_in: StatusMapIn;
  status_map_out: StatusMapOut;
  severity_map: SeverityMap;
  default_project_id: number | null;
  default_type: string | null;
  default_reporter: string | null;
  import_from: string | null;
  last_checked_at: string | null;
  readiness: { ready: boolean; reason: string | null };
}

export interface ConfigInput {
  site_url?: string;
  email?: string;
  api_token?: string;
  project_id?: string;
  project_key?: string;
  issue_type_id?: string;
  label?: string | null;
  status_map_in?: StatusMapIn;
  status_map_out?: StatusMapOut;
  severity_map?: SeverityMap;
  default_project_id?: number;
  default_type?: string;
  default_reporter?: string;
}

const NOT_SET_UP = "Jira incidents isn't set up yet";
const TOKEN_AGAIN = "Enter the API token again after changing the site URL or email";
const PERMISSION_LABELS: Record<string, string> = {
  BROWSE_PROJECTS: "Browse projects",
  TRANSITION_ISSUES: "Transition issues",
  LINK_ISSUES: "Link issues",
};

interface ConfigRow {
  organization_id: number;
  site_url: string | null;
  email: string | null;
  api_token_encrypted: string | null;
  service_account_id: string | null;
  service_account_time_zone: string | null;
  project_id: string | null;
  project_key: string | null;
  issue_type_id: string | null;
  label: string | null;
  status_map_in: StatusMapIn;
  status_map_out: StatusMapOut;
  severity_map: SeverityMap;
  default_project_id: number | null;
  default_project_name: string | null;
  default_type: string | null;
  default_reporter: string | null;
  import_from: Date | null;
  last_checked_at: Date | null;
}

function decryptToken(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch {
    logger.error("jira-incidents: stored API token could not be decrypted");
    return null;
  }
}

export async function loadConfig(orgId: number): Promise<JiraIncidentsConfig | null> {
  const found = (await sequelize.query(
    `SELECT c.organization_id, c.site_url, c.email, c.api_token_encrypted, c.service_account_id,
            c.service_account_time_zone, c.project_id, c.project_key, c.issue_type_id, c.label,
            c.status_map_in, c.status_map_out, c.severity_map, c.default_project_id,
            p.project_title AS default_project_name, c.default_type, c.default_reporter,
            c.import_from, c.last_checked_at
       FROM jira_incidents_config c
       LEFT JOIN projects p ON p.id = c.default_project_id AND p.organization_id = c.organization_id
      WHERE c.organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as ConfigRow[];
  const r = found[0];
  if (!r) return null;
  return {
    organizationId: r.organization_id,
    siteUrl: r.site_url,
    email: r.email,
    apiToken: decryptToken(r.api_token_encrypted),
    serviceAccountId: r.service_account_id,
    serviceAccountTimeZone: r.service_account_time_zone,
    projectId: r.project_id,
    projectKey: r.project_key,
    issueTypeId: r.issue_type_id,
    label: r.label,
    statusMapIn: r.status_map_in ?? {},
    statusMapOut: r.status_map_out ?? {},
    severityMap: r.severity_map ?? {},
    defaultProjectId: r.default_project_id,
    defaultProjectName: r.default_project_name,
    defaultType: r.default_type,
    defaultReporter: r.default_reporter,
    importFrom: r.import_from ? new Date(r.import_from) : null,
    lastCheckedAt: r.last_checked_at ? new Date(r.last_checked_at) : null,
  };
}

export function readinessOf(config: JiraIncidentsConfig | null): Readiness {
  if (!config) return { ready: false, status: 404, reason: NOT_SET_UP };
  const missing = (reason: string): Readiness => ({ ready: false, status: 400, reason });
  if (!config.siteUrl || !config.email || !config.apiToken || !config.serviceAccountId)
    return missing("Connect to Jira");
  if (!config.projectId) return missing("Choose a Jira project");
  if (!config.issueTypeId) return missing("Choose an issue type");
  if (Object.keys(config.statusMapIn).length === 0)
    return missing("Map Jira statuses to VerifyWise statuses");
  if (VW_STATUSES.some((s) => !(s in config.statusMapOut)))
    return missing("Map VerifyWise statuses to Jira");
  if (Object.keys(config.severityMap).length === 0)
    return missing("Map Jira priorities to severities");
  if (config.defaultProjectId === null)
    return missing("Choose the use case for imported incidents");
  if (!config.defaultType) return missing("Choose the incident type");
  if (!config.defaultReporter) return missing("Enter the reporter");
  return { ready: true };
}

export async function jiraIncidentsReadiness(orgId: number, _kind: string): Promise<Readiness> {
  return readinessOf(await loadConfig(orgId));
}

function buildClient(
  c: { siteUrl: string; email: string; apiToken: string },
  deadline?: AbortSignal,
): JiraIncidentsClient {
  return new JiraIncidentsClient({
    siteUrl: normalizeSiteUrl(c.siteUrl),
    email: c.email,
    apiToken: c.apiToken,
    deadline,
  });
}

/** A fresh client per run or request: a client allows one rate-limit wait. */
export function clientFor(
  config: JiraIncidentsConfig,
  deadline?: AbortSignal,
): JiraIncidentsClient {
  if (!config.siteUrl || !config.email || !config.apiToken) {
    throw new JiraIncidentsValidationError("Connect to Jira");
  }
  return buildClient(
    { siteUrl: config.siteUrl, email: config.email, apiToken: config.apiToken },
    deadline,
  );
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function viewOf(config: JiraIncidentsConfig | null): ConfigView {
  const readiness = readinessOf(config);
  return {
    configured: config !== null,
    site_url: config?.siteUrl ?? null,
    email: config?.email ?? null,
    has_api_token: !!config?.apiToken,
    service_account_id: config?.serviceAccountId ?? null,
    service_account_time_zone: config?.serviceAccountTimeZone ?? null,
    project_id: config?.projectId ?? null,
    project_key: config?.projectKey ?? null,
    issue_type_id: config?.issueTypeId ?? null,
    label: config?.label ?? null,
    status_map_in: config?.statusMapIn ?? {},
    status_map_out: config?.statusMapOut ?? {},
    severity_map: config?.severityMap ?? {},
    default_project_id: config?.defaultProjectId ?? null,
    default_type: config?.defaultType ?? null,
    default_reporter: config?.defaultReporter ?? null,
    import_from: iso(config?.importFrom ?? null),
    last_checked_at: iso(config?.lastCheckedAt ?? null),
    readiness: readiness.ready
      ? { ready: true, reason: null }
      : { ready: false, reason: readiness.reason },
  };
}

export async function getConfigView(orgId: number): Promise<ConfigView> {
  return viewOf(await loadConfig(orgId));
}

const bad = (message: string) => new JiraIncidentsValidationError(message);

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw bad(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw bad(`${field} must be ${max} characters or fewer`);
  return trimmed;
}

function numericId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{1,18}$/.test(value.trim()))
    throw bad(`${field} must be a number`);
  return value.trim();
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function useCaseExists(orgId: number, id: number, t?: Transaction): Promise<boolean> {
  const found = await sequelize.query(
    `SELECT project_title FROM projects WHERE id = :id AND organization_id = :orgId`,
    { replacements: { id, orgId }, type: QueryTypes.SELECT, transaction: t },
  );
  return found.length > 0;
}

/** Asks Jira with the submitted credentials; turns Jira failures into a plain validation error. */
async function askJira<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof JiraAuthError) throw bad(err.message);
    if (err instanceof JiraHttpError || err instanceof JiraUnreachableError) throw bad(err.message);
    throw err;
  }
}

export async function saveConfig(
  orgId: number,
  userId: number,
  input: ConfigInput,
): Promise<ConfigView> {
  const stored = await loadConfig(orgId);

  // 1. Merge and check the connection fields.
  const siteUrl =
    input.site_url !== undefined ? normalizeSiteUrl(input.site_url) : (stored?.siteUrl ?? null);
  const submittedEmail = optionalString(input.email, "Email", 255);
  if (submittedEmail === "") throw bad("Enter the service account email");
  const email = submittedEmail ?? stored?.email ?? null;
  const newToken = optionalString(input.api_token, "API token", 4096) || undefined;
  const siteChanged = siteUrl !== (stored?.siteUrl ?? null);
  const emailChanged = email !== (stored?.email ?? null);
  if ((siteChanged || emailChanged) && !newToken) throw bad(TOKEN_AGAIN);
  const apiToken = newToken ?? stored?.apiToken ?? null;

  // 2. Verify the credentials and remember the service account.
  let serviceAccountId = stored?.serviceAccountId ?? null;
  let serviceAccountTimeZone = stored?.serviceAccountTimeZone ?? null;
  const haveConnection = !!(siteUrl && email && apiToken);
  const connectionChanged = siteChanged || emailChanged || !!newToken;
  if (haveConnection && (connectionChanged || !serviceAccountId)) {
    const me = await askJira(() =>
      buildClient({ siteUrl: siteUrl!, email: email!, apiToken: apiToken! }).myself(),
    );
    serviceAccountId = me.accountId;
    serviceAccountTimeZone = me.timeZone;
  }

  // 3. Field checks.
  const projectId = numericId(input.project_id, "Project") ?? stored?.projectId ?? null;
  const issueTypeId = numericId(input.issue_type_id, "Issue type") ?? stored?.issueTypeId ?? null;
  const projectKey =
    optionalString(input.project_key, "Project key", 64) ?? stored?.projectKey ?? null;
  const label =
    input.label === undefined
      ? (stored?.label ?? null)
      : input.label === null
        ? null
        : optionalString(input.label, "Label", 255) || null;
  const defaultType =
    optionalString(input.default_type, "Incident type", 64) ?? stored?.defaultType ?? null;
  if (input.default_type !== undefined && !INCIDENT_TYPES.includes(defaultType ?? ""))
    throw bad("Choose a valid incident type");
  const reporter = optionalString(input.default_reporter, "Reporter", 255);
  if (reporter !== undefined && reporter.length < 1) throw bad("Enter the reporter");
  const defaultReporter = reporter ?? stored?.defaultReporter ?? null;
  let defaultProjectId = stored?.defaultProjectId ?? null;
  if (input.default_project_id !== undefined) {
    if (
      !Number.isInteger(input.default_project_id) ||
      !(await useCaseExists(orgId, input.default_project_id))
    )
      throw bad("Choose a use case from this organization");
    defaultProjectId = input.default_project_id;
  }

  // 4. Mappings.
  const statusMapIn = input.status_map_in ?? stored?.statusMapIn ?? {};
  const statusMapOut = input.status_map_out ?? stored?.statusMapOut ?? {};
  const severityMap = input.severity_map ?? stored?.severityMap ?? {};
  const mapError = validateMaps({ statusMapIn, statusMapOut, severityMap });
  if (mapError) throw bad(mapError);
  const selectionChanged =
    projectId !== (stored?.projectId ?? null) ||
    issueTypeId !== (stored?.issueTypeId ?? null) ||
    !sameJson(statusMapIn, stored?.statusMapIn ?? {});
  if (
    haveConnection &&
    projectId &&
    issueTypeId &&
    Object.keys(statusMapIn).length > 0 &&
    selectionChanged
  ) {
    const statuses = await askJira(() =>
      buildClient({ siteUrl: siteUrl!, email: email!, apiToken: apiToken! }).listStatuses(
        projectId,
        issueTypeId,
      ),
    );
    const unmapped = unmappedStatuses(statuses, statusMapIn);
    if (unmapped.length > 0) {
      throw bad(
        `Map every Jira status: ${unmapped.map((s) => `'${s.name}'`).join(", ")} aren't mapped`,
      );
    }
  }

  // 5. Save, then switch the sync on the first time setup is complete.
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `INSERT INTO jira_incidents_config
         (organization_id, site_url, email, api_token_encrypted, service_account_id,
          service_account_time_zone, project_id, project_key, issue_type_id, label,
          status_map_in, status_map_out, severity_map, default_project_id, default_type,
          default_reporter, updated_by)
       VALUES (:orgId, :siteUrl, :email, :token, :serviceAccountId, :serviceAccountTimeZone,
          :projectId, :projectKey, :issueTypeId, :label, CAST(:mapIn AS JSONB),
          CAST(:mapOut AS JSONB), CAST(:severity AS JSONB), :defaultProjectId, :defaultType,
          :defaultReporter, :userId)
       ON CONFLICT (organization_id) DO UPDATE SET
          site_url = EXCLUDED.site_url, email = EXCLUDED.email,
          api_token_encrypted = COALESCE(:token, jira_incidents_config.api_token_encrypted),
          service_account_id = EXCLUDED.service_account_id,
          service_account_time_zone = EXCLUDED.service_account_time_zone,
          project_id = EXCLUDED.project_id, project_key = EXCLUDED.project_key,
          issue_type_id = EXCLUDED.issue_type_id, label = EXCLUDED.label,
          status_map_in = EXCLUDED.status_map_in, status_map_out = EXCLUDED.status_map_out,
          severity_map = EXCLUDED.severity_map, default_project_id = EXCLUDED.default_project_id,
          default_type = EXCLUDED.default_type, default_reporter = EXCLUDED.default_reporter,
          updated_by = EXCLUDED.updated_by, updated_at = now()`,
      {
        replacements: {
          orgId,
          siteUrl,
          email,
          token: newToken ? encrypt(newToken) : null,
          serviceAccountId,
          serviceAccountTimeZone,
          projectId,
          projectKey,
          issueTypeId,
          label,
          mapIn: JSON.stringify(statusMapIn),
          mapOut: JSON.stringify(statusMapOut),
          severity: JSON.stringify(severityMap),
          defaultProjectId,
          defaultType,
          defaultReporter,
          userId,
        },
        transaction,
      },
    );

    const merged: JiraIncidentsConfig = {
      organizationId: orgId,
      siteUrl,
      email,
      apiToken,
      serviceAccountId,
      serviceAccountTimeZone,
      projectId,
      projectKey,
      issueTypeId,
      label,
      statusMapIn,
      statusMapOut,
      severityMap,
      defaultProjectId,
      defaultProjectName: null,
      defaultType,
      defaultReporter,
      importFrom: stored?.importFrom ?? null,
      lastCheckedAt: stored?.lastCheckedAt ?? null,
    };
    if (readinessOf(merged).ready && !stored?.importFrom) {
      await sequelize.query(
        `UPDATE jira_incidents_config SET import_from = now()
          WHERE organization_id = :orgId AND import_from IS NULL`,
        { replacements: { orgId }, transaction },
      );
      await sequelize.query(
        `INSERT INTO extension_sync_settings
           (organization_id, extension_key, enabled, interval_hours, updated_by)
         VALUES (:orgId, :key, TRUE, 1, :userId)
         ON CONFLICT (organization_id, extension_key) DO NOTHING`,
        { replacements: { orgId, key: JIRA_INCIDENTS_KEY, userId }, transaction },
      );
    }
  });

  return getConfigView(orgId);
}

const submittedString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

export async function testConnection(
  orgId: number,
  submitted: Record<string, unknown>,
): Promise<{ success: boolean; message: string; testedAt: string }> {
  const result = (success: boolean, message: string) => ({
    success,
    message,
    testedAt: new Date().toISOString(),
  });
  try {
    const stored = await loadConfig(orgId);
    const rawSite = submittedString(submitted.site_url) ?? stored?.siteUrl ?? null;
    const email = submittedString(submitted.email) ?? stored?.email ?? null;
    const token = submittedString(submitted.api_token) ?? stored?.apiToken ?? null;
    const projectId = submittedString(submitted.project_id) ?? stored?.projectId ?? null;

    let siteUrl: string | null = null;
    let siteError: JiraIncidentsValidationError | null = null;
    try {
      siteUrl = normalizeSiteUrl(rawSite);
    } catch (err) {
      if (!(err instanceof JiraIncidentsValidationError)) throw err;
      siteError = err;
    }
    const tokenSubmitted = submittedString(submitted.api_token) !== undefined;
    const changed =
      (siteUrl ?? rawSite) !== (stored?.siteUrl ?? null) || email !== (stored?.email ?? null);
    if (!tokenSubmitted && changed && (stored || rawSite || email))
      return result(false, TOKEN_AGAIN);
    if (siteError) return result(false, siteError.message);
    if (!siteUrl || !email || !token)
      return result(false, "Enter the site URL, email and API token");

    const client = buildClient({ siteUrl, email, apiToken: token });
    const me = await client.myself();
    const missing = projectId ? await client.missingPermissions(projectId) : [];
    if (missing.length > 0) {
      return result(
        false,
        `Connected, but the service account is missing: ${missing
          .map((k) => PERMISSION_LABELS[k] ?? k)
          .join(", ")}`,
      );
    }
    return result(true, `Connected to Jira as ${me.accountId}.`);
  } catch (err) {
    if (err instanceof JiraHttpError || err instanceof JiraUnreachableError)
      return result(false, err.message);
    logger.error(`jira-incidents: connection test failed: ${(err as Error)?.message ?? err}`);
    return result(false, "Could not test the connection to Jira");
  }
}

export async function markChecked(orgId: number, at: Date): Promise<void> {
  await sequelize.query(
    `UPDATE jira_incidents_config SET last_checked_at = :at WHERE organization_id = :orgId`,
    { replacements: { orgId, at } },
  );
}
