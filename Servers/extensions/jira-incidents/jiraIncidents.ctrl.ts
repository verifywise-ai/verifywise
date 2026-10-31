import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../../utils/logger/logHelper";
import { ExtensionModel } from "../../domain.layer/models/extension/extension.model";
import { ExtensionEnablementModel } from "../../domain.layer/models/extension/extensionEnablement.model";
import {
  EVENTS_DEFAULT_LIMIT,
  EVENTS_MAX_LIMIT,
  JIRA_INCIDENTS_KEY,
} from "./jiraIncidents.constants";
import {
  clientFor,
  ConfigInput,
  getConfigView,
  loadConfig,
  saveConfig,
} from "./jiraIncidents.config";
import { JiraHttpError, JiraRateLimitError, JiraUnreachableError } from "./jiraIncidents.errors";
import { JiraIncidentsClient } from "./jiraIncidents.client";
import { linksForIncidents, listEvents } from "./jiraIncidents.store";
import { defaultSeverityMap, defaultStatusMapIn, defaultStatusMapOut } from "./mapping";
import { JiraIncidentsValidationError } from "./siteUrl";

const fileName = "jiraIncidents.ctrl.ts";
const CONNECT_FIRST = "Connect to Jira first";
const RATE_LIMITED = "Rate limited by Jira. Try again in a minute.";
const MAX_LINK_IDS = 500;
const NUMERIC_ID = /^\d{1,18}$/;

function orgId(req: Request): number {
  return (req as any).organizationId;
}
function uid(req: Request): number {
  return (req as any).userId;
}
function queryString(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : undefined;
}

/** A 400 the caller can fix; carries the reason in `data` (STATUS_CODE shape). */
class BadRequest extends Error {}

/**
 * Map an error to a response:
 * - BadRequest, JiraIncidentsValidationError → 400 with the message
 * - JiraRateLimitError → 502 "Rate limited by Jira. Try again in a minute."
 * - JiraHttpError (401 included: Jira's answer, not the caller's auth), JiraUnreachableError → 502
 * - anything else → 500, logged
 */
function sendError(req: Request, res: Response, err: unknown, functionName: string) {
  if (err instanceof BadRequest || err instanceof JiraIncidentsValidationError) {
    return res.status(400).json(STATUS_CODE[400](err.message));
  }
  if (err instanceof JiraRateLimitError) {
    return res.status(502).json(STATUS_CODE[502](RATE_LIMITED));
  }
  if (err instanceof JiraHttpError || err instanceof JiraUnreachableError) {
    return res.status(502).json(STATUS_CODE[502](err.message));
  }
  logStructured("error", `jira-incidents ${functionName} failed`, functionName, fileName);
  logger.error(`❌ Error in jira-incidents ${functionName}:`, err);
  return res.status(500).json(STATUS_CODE[500](translateError(req, err)));
}

/** A client from the saved connection; the pickers need one before they can ask Jira. */
async function requireClient(organizationId: number): Promise<JiraIncidentsClient> {
  const config = await loadConfig(organizationId);
  if (!config?.siteUrl || !config.email || !config.apiToken) throw new BadRequest(CONNECT_FIRST);
  return clientFor(config);
}

function requireNumericId(req: Request, name: string, label: string): string {
  const value = queryString(req, name);
  if (!value || !NUMERIC_ID.test(value)) throw new BadRequest(`${label} must be a number`);
  return value;
}

// ---- Config ------------------------------------------------------------

export async function getConfigCtrl(req: Request, res: Response): Promise<any> {
  try {
    return res.status(200).json(STATUS_CODE[200](await getConfigView(orgId(req))));
  } catch (err) {
    return sendError(req, res, err, "getConfig");
  }
}

export async function putConfigCtrl(req: Request, res: Response): Promise<any> {
  const ctx = { functionName: "putConfig", fileName, userId: uid(req), organizationId: orgId(req) };
  logProcessing({ ...ctx, description: "saving Jira incidents settings" });
  try {
    const view = await saveConfig(orgId(req), uid(req), (req.body ?? {}) as ConfigInput);
    await logSuccess({ ...ctx, eventType: "Update", description: "Saved Jira incidents settings" });
    return res.status(200).json(STATUS_CODE[200](view));
  } catch (err) {
    if (!(err instanceof JiraIncidentsValidationError)) {
      await logFailure({
        ...ctx,
        eventType: "Update",
        description: "Failed to save Jira incidents settings",
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
    return sendError(req, res, err, "putConfig");
  }
}

// ---- Jira pickers ------------------------------------------------------

export async function getProjectsCtrl(req: Request, res: Response): Promise<any> {
  try {
    const client = await requireClient(orgId(req));
    const projects = await client.listProjects();
    return res
      .status(200)
      .json(STATUS_CODE[200](projects.map(({ id, key, name }) => ({ id, key, name }))));
  } catch (err) {
    return sendError(req, res, err, "getProjects");
  }
}

export async function getIssueTypesCtrl(req: Request, res: Response): Promise<any> {
  try {
    const project = requireNumericId(req, "project", "Project");
    const client = await requireClient(orgId(req));
    return res.status(200).json(STATUS_CODE[200](await client.listIssueTypes(project)));
  } catch (err) {
    return sendError(req, res, err, "getIssueTypes");
  }
}

export async function getStatusesCtrl(req: Request, res: Response): Promise<any> {
  try {
    const project = requireNumericId(req, "project", "Project");
    const issueType = requireNumericId(req, "issue_type", "Issue type");
    const client = await requireClient(orgId(req));
    const statuses = await client.listStatuses(project, issueType);
    return res.status(200).json(
      STATUS_CODE[200]({
        statuses,
        default_map_in: defaultStatusMapIn(statuses),
        default_map_out: defaultStatusMapOut(statuses),
      }),
    );
  } catch (err) {
    return sendError(req, res, err, "getStatuses");
  }
}

export async function getPrioritiesCtrl(req: Request, res: Response): Promise<any> {
  try {
    const client = await requireClient(orgId(req));
    const priorities = await client.listPriorities();
    return res
      .status(200)
      .json(STATUS_CODE[200]({ priorities, default_severity_map: defaultSeverityMap(priorities) }));
  } catch (err) {
    return sendError(req, res, err, "getPriorities");
  }
}

export async function getLabelsCtrl(req: Request, res: Response): Promise<any> {
  try {
    const query = queryString(req, "query") ?? "";
    if (query.length > 255) throw new BadRequest("Label search must be 255 characters or fewer");
    const client = await requireClient(orgId(req));
    return res.status(200).json(STATUS_CODE[200](await client.listLabels(query)));
  } catch (err) {
    return sendError(req, res, err, "getLabels");
  }
}

// ---- Activity and links ------------------------------------------------

export async function getEventsCtrl(req: Request, res: Response): Promise<any> {
  try {
    const raw = queryString(req, "limit");
    let limit = EVENTS_DEFAULT_LIMIT;
    if (raw !== undefined) {
      limit = /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(limit) || limit < 1 || limit > EVENTS_MAX_LIMIT) {
        throw new BadRequest(`Limit must be a whole number from 1 to ${EVENTS_MAX_LIMIT}`);
      }
    }
    return res.status(200).json(STATUS_CODE[200](await listEvents(orgId(req), limit)));
  } catch (err) {
    return sendError(req, res, err, "getEvents");
  }
}

function parseIncidentIds(raw: string | undefined): number[] {
  const parts = (raw ?? "").split(",").map((p) => p.trim());
  const ids = parts.map((p) => (/^\d{1,15}$/.test(p) ? Number(p) : NaN));
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new BadRequest("incident_ids must be a comma-separated list of incident ids");
  }
  if (ids.length > MAX_LINK_IDS) {
    throw new BadRequest(`Ask for at most ${MAX_LINK_IDS} incidents at a time`);
  }
  return [...new Set(ids)];
}

/**
 * The chips on incidents. Open to any member, and an empty list (not 403) when
 * the extension is off, so the route checks enablement itself.
 */
export async function getLinksCtrl(req: Request, res: Response): Promise<any> {
  try {
    const incidentIds = parseIncidentIds(queryString(req, "incident_ids"));
    const extension = await ExtensionModel.findByKey(JIRA_INCIDENTS_KEY);
    const enablement = extension
      ? await ExtensionEnablementModel.findByExtensionId(extension.id, orgId(req))
      : null;
    if (!enablement?.enabled) return res.status(200).json(STATUS_CODE[200]([]));
    return res.status(200).json(STATUS_CODE[200](await linksForIncidents(orgId(req), incidentIds)));
  } catch (err) {
    return sendError(req, res, err, "getLinks");
  }
}
