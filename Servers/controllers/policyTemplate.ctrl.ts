/**
 * @fileoverview Policy Templates Controller
 *
 * Endpoints for the organisation-owned policy template catalog: list system +
 * org templates, fetch one, create, update, delete, and "save as template"
 * from an existing policy_manager row.
 *
 * All endpoints require JWT authentication and are org-scoped via
 * req.organizationId. Writes additionally require the policyTemplate.edit
 * permission (route level).
 *
 * @module controllers/policyTemplate
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  getPolicyTemplatesQuery,
  getPolicyTemplateByIdQuery,
  createPolicyTemplateQuery,
  updatePolicyTemplateQuery,
  deletePolicyTemplateQuery,
  createPolicyTemplateFromPolicyQuery,
} from "../utils/policyTemplate.utils";

const FILE_NAME = "policyTemplate.ctrl.ts";

// Maps CustomException subclasses to their status, mirroring
// reportTemplate.ctrl.ts. The utils layer already converts Postgres unique
// violations (23505) to ConflictException (409); the pgErr check stays as a
// backstop for any raw Sequelize error that slips past it.
// Route ids arrive as strings; Number("abc") is NaN, which Postgres rejects
// as an integer and would surface as a 500. Returns null for anything that is
// not a positive safe integer.
const parseId = (raw: unknown): number | null => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  const pgErr = (error as any)?.parent ?? (error as any)?.original;
  if (pgErr?.code === "23505") {
    return res
      .status(409)
      .json(STATUS_CODE[409](req.t!("a template with this name already exists")));
  }
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};

export async function listPolicyTemplates(req: Request, res: Response): Promise<any> {
  try {
    return res
      .status(200)
      .json(STATUS_CODE[200](await getPolicyTemplatesQuery(req.organizationId!)));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function getPolicyTemplate(req: Request, res: Response): Promise<any> {
  const id = parseId(req.params.id);
  if (id === null)
    return res.status(400).json(STATUS_CODE[400](req.t!("a numeric template id is required")));
  try {
    const tpl = await getPolicyTemplateByIdQuery(id, req.organizationId!);
    if (!tpl) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
    return res.status(200).json(STATUS_CODE[200](tpl));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function createPolicyTemplate(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "createPolicyTemplate",
    functionName: "createPolicyTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const tpl = await createPolicyTemplateQuery(req.body, req.organizationId!, req.userId!);
    await logSuccess({
      eventType: "Create",
      description: `Created policy template ${tpl.id}`,
      functionName: "createPolicyTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](tpl));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "createPolicyTemplate failed",
      functionName: "createPolicyTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function updatePolicyTemplate(req: Request, res: Response): Promise<any> {
  const id = parseId(req.params.id);
  if (id === null)
    return res.status(400).json(STATUS_CODE[400](req.t!("a numeric template id is required")));
  logProcessing({
    description: `updatePolicyTemplate ${id}`,
    functionName: "updatePolicyTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    // Same six names as the `allowed` list in updatePolicyTemplateQuery — if
    // these drift apart, a PATCH for the missing field 400s as "no updatable
    // fields".
    const metadataChanged = [
      "name",
      "category",
      "description",
      "content",
      "tags",
      "is_active",
    ].some((f) => req.body?.[f] !== undefined);
    if (!metadataChanged) {
      return res.status(400).json(STATUS_CODE[400](req.t!("no updatable fields supplied")));
    }
    const tpl = await updatePolicyTemplateQuery(id, req.organizationId!, req.body);
    if (!tpl) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
    await logSuccess({
      eventType: "Update",
      description: `Updated policy template ${id}`,
      functionName: "updatePolicyTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](tpl));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "updatePolicyTemplate failed",
      functionName: "updatePolicyTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function deletePolicyTemplate(req: Request, res: Response): Promise<any> {
  const id = parseId(req.params.id);
  if (id === null)
    return res.status(400).json(STATUS_CODE[400](req.t!("a numeric template id is required")));
  logProcessing({
    description: `deletePolicyTemplate ${id}`,
    functionName: "deletePolicyTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const row = await deletePolicyTemplateQuery(id, req.organizationId!);
    if (!row) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
    await logSuccess({
      eventType: "Delete",
      description: `Deleted policy template ${id}`,
      functionName: "deletePolicyTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(202).json(STATUS_CODE[202]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "deletePolicyTemplate failed",
      functionName: "deletePolicyTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

/**
 * POST /from-policy — "Save as template" from an existing policy_manager row.
 * The copy is org-owned; the source policy is untouched.
 */
export async function createPolicyTemplateFromPolicy(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "createPolicyTemplateFromPolicy",
    functionName: "createPolicyTemplateFromPolicy",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const policyId = Number(req.body?.policy_id);
    if (!Number.isSafeInteger(policyId) || policyId <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!("a numeric policy_id is required")));
    }
    const tpl = await createPolicyTemplateFromPolicyQuery(
      policyId,
      req.organizationId!,
      req.userId!,
      req.body?.name,
      req.body?.category,
    );
    await logSuccess({
      eventType: "Create",
      description: `Created policy template ${tpl.id} from policy ${policyId}`,
      functionName: "createPolicyTemplateFromPolicy",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](tpl));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "createPolicyTemplateFromPolicy failed",
      functionName: "createPolicyTemplateFromPolicy",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}
