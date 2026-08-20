import { Request, Response } from "express";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import logger, { logStructured } from "../../utils/logger/fileLogger";
import { translateError } from "../../utils/i18n.utils";
import { JiraAssetsClient } from "./jira.client";
import { VW_AI_SYSTEM_ATTRIBUTES, transformAttributes } from "./jira.constants";
import {
  clientFromConfig,
  deleteUseCaseByProjectId,
  getCustomFrameworksProgress,
  getPublicConfig,
  getSyncHistory,
  getSyncStatus,
  getUseCaseByProjectId,
  importObjects,
  JiraAssetsConfig,
  listUseCases,
  loadFullConfig,
  saveConfig,
  syncObjects,
} from "./jiraAssets.service";

const fileName = "jiraAssets.ctrl.ts";

function orgId(req: Request): number {
  return (req as any).organizationId;
}
function uid(req: Request): number {
  return (req as any).userId;
}
function stringParam(req: Request, name: string): string {
  const raw = req.params[name];
  return Array.isArray(raw) ? String(raw[0]) : String(raw);
}
function intParam(req: Request, name: string): number {
  return parseInt(stringParam(req, name), 10);
}

async function requireClient(organizationId: number): Promise<JiraAssetsClient> {
  const config = await loadFullConfig(organizationId);
  if (!config?.jira_base_url || !config.workspace_id || !config.email) {
    throw new Error("JIRA not configured");
  }
  return clientFromConfig(config);
}

// ---- Config ------------------------------------------------------------

export async function getConfig(req: Request, res: Response): Promise<any> {
  try {
    const config = await getPublicConfig(orgId(req));
    return res.status(200).json(STATUS_CODE[200](config));
  } catch (err) {
    logStructured("error", "jira getConfig failed", "getConfig", fileName);
    logger.error("❌ Error in jira getConfig:", err);
    return res.status(500).json(STATUS_CODE[500](translateError(req, err)));
  }
}

export async function postConfig(req: Request, res: Response): Promise<any> {
  try {
    await saveConfig(orgId(req), uid(req), req.body as JiraAssetsConfig);
    return res
      .status(200)
      .json(STATUS_CODE[200]({ success: true, message: "Configuration saved successfully" }));
  } catch (err: any) {
    // Validation errors surface as 400 so the UI can render them inline.
    const bad = /required/i.test(err.message);
    const status = bad ? 400 : 500;
    if (!bad) {
      logStructured("error", "jira postConfig failed", "postConfig", fileName);
      logger.error("❌ Error in jira postConfig:", err);
    }
    return res.status(status).json(STATUS_CODE[status](err.message));
  }
}

// ---- Test connection ---------------------------------------------------
//
// Serviced by the generic POST /api/extensions/:key/test-connection route
// (controllers/extension.ctrl.ts → TEST_CONNECTION_DISPATCH["jira-assets"]).
// The dispatch entry reuses `clientFromConfig` + `loadFullConfig` from the
// service module, so there is no logic in this controller for it.

// ---- Static VW attribute list -----------------------------------------

export async function getVwAttributes(_req: Request, res: Response): Promise<any> {
  return res.status(200).json(STATUS_CODE[200](VW_AI_SYSTEM_ATTRIBUTES));
}

// ---- Schema / object-type / attribute discovery ------------------------

export async function getSchemas(req: Request, res: Response): Promise<any> {
  try {
    const client = await requireClient(orgId(req));
    const schemas = await client.getSchemas();
    return res.status(200).json(STATUS_CODE[200](schemas));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function getObjectTypes(req: Request, res: Response): Promise<any> {
  try {
    const client = await requireClient(orgId(req));
    const objectTypes = await client.getObjectTypes(stringParam(req, "schemaId"));
    return res.status(200).json(STATUS_CODE[200](objectTypes));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function getAttributes(req: Request, res: Response): Promise<any> {
  try {
    const client = await requireClient(orgId(req));
    const attributes = await client.getAttributes(stringParam(req, "objectTypeId"));
    return res.status(200).json(STATUS_CODE[200](attributes));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function getObjects(req: Request, res: Response): Promise<any> {
  try {
    const client = await requireClient(orgId(req));
    const objects = await client.getObjects(stringParam(req, "objectTypeId"));
    const transformed = objects.map((obj) => ({
      id: obj.id,
      key: obj.objectKey,
      name: obj.label,
      attributes: transformAttributes(obj.attributes, (obj as any)._attrIdToName || {}),
      created: obj.created,
      updated: obj.updated,
    }));
    return res.status(200).json(STATUS_CODE[200](transformed));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

// ---- Import / sync -----------------------------------------------------

export async function postImport(req: Request, res: Response): Promise<any> {
  try {
    const objectIds = (req.body?.object_ids ?? []) as string[];
    const result = await importObjects(orgId(req), uid(req), objectIds);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (err: any) {
    logStructured("error", "jira import failed", "postImport", fileName);
    logger.error("❌ Error in jira postImport:", err);
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function postSync(req: Request, res: Response): Promise<any> {
  try {
    const result = await syncObjects(orgId(req), uid(req), "manual");
    return res.status(result.success ? 200 : 500).json(STATUS_CODE[200](result));
  } catch (err: any) {
    logStructured("error", "jira sync failed", "postSync", fileName);
    logger.error("❌ Error in jira postSync:", err);
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function getSyncStatusCtrl(req: Request, res: Response): Promise<any> {
  try {
    const status = await getSyncStatus(orgId(req));
    return res.status(200).json(STATUS_CODE[200](status));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function getSyncHistoryCtrl(req: Request, res: Response): Promise<any> {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 200);
    const history = await getSyncHistory(orgId(req), limit);
    return res.status(200).json(STATUS_CODE[200](history));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

// ---- Use cases ---------------------------------------------------------

export async function listUseCasesCtrl(req: Request, res: Response): Promise<any> {
  try {
    const useCases = await listUseCases(orgId(req));
    return res.status(200).json(STATUS_CODE[200](useCases));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function getUseCaseCtrl(req: Request, res: Response): Promise<any> {
  try {
    const useCase = await getUseCaseByProjectId(intParam(req, "id"), orgId(req));
    if (!useCase) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Use case not found")));
    }
    return res.status(200).json(STATUS_CODE[200](useCase));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

export async function deleteUseCaseCtrl(req: Request, res: Response): Promise<any> {
  try {
    await deleteUseCaseByProjectId(intParam(req, "id"), orgId(req));
    return res.status(200).json(STATUS_CODE[200]({ success: true }));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}

// ---- Custom frameworks progress ---------------------------------------

export async function getCustomFrameworksProgressCtrl(req: Request, res: Response): Promise<any> {
  try {
    const progress = await getCustomFrameworksProgress(intParam(req, "projectId"), orgId(req));
    return res.status(200).json(STATUS_CODE[200](progress));
  } catch (err: any) {
    return res.status(500).json(STATUS_CODE[500](err.message));
  }
}
