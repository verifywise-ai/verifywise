import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import {
  MrmFindingSeverity,
  MrmFindingStage,
  MrmModelRole,
  MrmTier,
  MrmValidationOutcome,
  MrmValidationStage,
  MrmValidationTrigger,
} from "../domain.layer/enums/mrm.enum";
import {
  assignModelTierQuery,
  createFindingQuery,
  createValidationQuery,
  getFindingByIdQuery,
  getFindingsQuery,
  getFleetTieringQuery,
  getModelRolesQuery,
  getModelTierQuery,
  getValidationByIdQuery,
  getValidationModelIdQuery,
  getValidationsQuery,
  modelExistsForOrgQuery,
  setModelRolesQuery,
  signoffValidationQuery,
  updateFindingQuery,
  updateValidationQuery,
} from "../utils/mrm.utils";
import { triggerRevalidation } from "../utils/mrmRevalidation.utils";
import { MrmRevalidationTriggerSource } from "../domain.layer/enums/mrmMonitoring.enum";

const FILE = "mrm.ctrl.ts";

/**
 * Map a domain CustomException to its HTTP status, otherwise 500. Keeps the
 * catch blocks thin while still surfacing 400/404/409 correctly.
 */
function fail(req: Request, res: Response, fn: string, msg: string, error: unknown) {
  logStructured("error", msg, fn, FILE);
  logger.error(`❌ Error in ${fn}:`, error);
  const status = error instanceof CustomException ? error.statusCode : 500;
  if (status >= 500) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
  const body = (STATUS_CODE as any)[status]
    ? (STATUS_CODE as any)[status](translateError(req, error))
    : STATUS_CODE[400](translateError(req, error));
  return res.status(status).json(body);
}

const parseId = (raw: string | string[]): number => parseInt(Array.isArray(raw) ? raw[0] : raw, 10);

// ---------------------------------------------------------------------------
// Tiering
// ---------------------------------------------------------------------------

export async function getFleetTiering(req: Request, res: Response) {
  const fn = "getFleetTiering";
  logStructured("processing", "fetching fleet tiering", fn, FILE);
  try {
    const rows = await getFleetTieringQuery(req.organizationId!);
    logStructured("successful", "fleet tiering retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve fleet tiering", error);
  }
}

export async function assignModelTier(req: Request, res: Response) {
  const fn = "assignModelTier";
  const modelId = parseId(req.params.modelId);
  const { tier, materiality_drivers } = req.body ?? {};

  logStructured("processing", `assigning tier for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }
  if (!Object.values(MrmTier).includes(tier)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Tier must be one of 1, 2 or 3")));
  }

  try {
    // Fetch the old tier BEFORE the update so we can detect an upward re-tier.
    const oldTier = await getModelTierQuery(modelId, req.organizationId!);

    const updated = await assignModelTierQuery(
      modelId,
      req.organizationId!,
      tier,
      typeof materiality_drivers === "string" ? materiality_drivers : null,
      req.userId!,
    );
    if (!updated) {
      logStructured("successful", `model not found: ${modelId}`, fn, FILE);
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }

    // Tier-increase trigger: tier "1" is the highest risk, so a LOWER number is a
    // higher risk. Fire only when the model was previously tiered and moved up in
    // risk. Best-effort — a trigger failure must not fail the tier assignment.
    if (oldTier !== null && Number(tier) < Number(oldTier)) {
      try {
        await triggerRevalidation(
          req.organizationId!,
          modelId,
          MrmRevalidationTriggerSource.TIER_INCREASE,
          `re-tiered from ${oldTier} to ${tier}`,
          { old_tier: oldTier, new_tier: tier },
        );
      } catch (error) {
        logger.error("❌ Failed to open revalidation task after tier increase:", error);
      }
    }

    logStructured("successful", `tier assigned for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return fail(req, res, fn, "failed to assign model tier", error);
  }
}

// ---------------------------------------------------------------------------
// Validations
// ---------------------------------------------------------------------------

export async function getValidations(req: Request, res: Response) {
  const fn = "getValidations";
  logStructured("processing", "fetching validations", fn, FILE);
  try {
    const modelIdRaw = req.query.modelId;
    const modelId = modelIdRaw ? parseInt(String(modelIdRaw), 10) : undefined;
    if (modelIdRaw && Number.isNaN(modelId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
    }
    const rows = await getValidationsQuery(req.organizationId!, modelId);
    logStructured("successful", "validations retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve validations", error);
  }
}

export async function createValidation(req: Request, res: Response) {
  const fn = "createValidation";
  const modelId = parseId(req.params.modelId);
  const { trigger, validator_id, report_version, report, next_due } = req.body ?? {};

  logStructured("processing", `starting validation for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }
  if (trigger !== undefined && !Object.values(MrmValidationTrigger).includes(trigger)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation trigger")));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const created = await createValidationQuery(modelId, req.organizationId!, {
      trigger,
      validator_id: validator_id ?? null,
      report_version: report_version ?? null,
      report: report ?? {},
      next_due: next_due ? new Date(next_due) : null,
    });
    logStructured("successful", `validation started for model ${modelId}`, fn, FILE);
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    // ConflictException from the one-active-validation partial-unique index → 409.
    return fail(req, res, fn, "failed to start validation", error);
  }
}

export async function updateValidation(req: Request, res: Response) {
  const fn = "updateValidation";
  const id = parseId(req.params.id);
  const { stage, trigger, validator_id, outcome, report_version, report, next_due } =
    req.body ?? {};

  logStructured("processing", `updating validation ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation id")));
  }
  if (stage !== undefined && !Object.values(MrmValidationStage).includes(stage)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation stage")));
  }
  // 'validated' is reached only via the sign-off endpoint (which stamps the
  // signer/outcome and enforces the lifecycle). Setting it here would bypass all
  // of that and free up the one-active-validation slot without a sign-off record.
  if (stage === MrmValidationStage.VALIDATED) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("Use the sign-off endpoint to complete a validation")));
  }
  if (trigger !== undefined && !Object.values(MrmValidationTrigger).includes(trigger)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation trigger")));
  }
  if (
    outcome !== undefined &&
    outcome !== null &&
    !Object.values(MrmValidationOutcome).includes(outcome)
  ) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation outcome")));
  }

  try {
    // Pre-fetch for a consistent, org-scoped 404 (mirrors signoffValidation).
    const existing = await getValidationByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Validation not found")));
    }
    const updated = await updateValidationQuery(id, req.organizationId!, {
      stage,
      trigger,
      validator_id,
      outcome,
      report_version,
      report,
      next_due: next_due !== undefined ? (next_due ? new Date(next_due) : null) : undefined,
    });
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Validation not found")));
    }
    logStructured("successful", `validation ${id} updated`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return fail(req, res, fn, "failed to update validation", error);
  }
}

export async function signoffValidation(req: Request, res: Response) {
  const fn = "signoffValidation";
  const id = parseId(req.params.id);
  const { outcome, report_version } = req.body ?? {};

  logStructured("processing", `signing off validation ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation id")));
  }
  if (!Object.values(MrmValidationOutcome).includes(outcome)) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("A valid outcome is required to sign off a validation")));
  }

  try {
    const existing = await getValidationByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Validation not found")));
    }
    if (existing.stage === MrmValidationStage.VALIDATED) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("This validation is already signed off")));
    }
    if (existing.stage === MrmValidationStage.NOT_STARTED) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Cannot sign off a validation that has not started")));
    }
    const signed = await signoffValidationQuery(id, req.organizationId!, {
      outcome,
      report_version: report_version ?? null,
      signed_off_by: req.userId!,
    });
    if (!signed) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Validation not found")));
    }
    logStructured("successful", `validation ${id} signed off`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](signed));
  } catch (error) {
    return fail(req, res, fn, "failed to sign off validation", error);
  }
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export async function getFindings(req: Request, res: Response) {
  const fn = "getFindings";
  logStructured("processing", "fetching findings", fn, FILE);
  try {
    const modelIdRaw = req.query.modelId;
    const validationIdRaw = req.query.validationId;
    const modelId = modelIdRaw ? parseInt(String(modelIdRaw), 10) : undefined;
    const validationId = validationIdRaw ? parseInt(String(validationIdRaw), 10) : undefined;
    if ((modelIdRaw && Number.isNaN(modelId)) || (validationIdRaw && Number.isNaN(validationId))) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid filter id")));
    }
    const rows = await getFindingsQuery(req.organizationId!, modelId, validationId);
    logStructured("successful", "findings retrieved", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve findings", error);
  }
}

export async function createFinding(req: Request, res: Response) {
  const fn = "createFinding";
  const validationId = parseId(req.params.validationId);
  const { title, severity, owner_id, remediation_plan, due_date } = req.body ?? {};

  logStructured("processing", `creating finding for validation ${validationId}`, fn, FILE);

  if (Number.isNaN(validationId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid validation id")));
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A finding title is required")));
  }
  if (title.trim().length > 255) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("A finding title must be 255 characters or fewer")));
  }
  if (severity !== undefined && !Object.values(MrmFindingSeverity).includes(severity)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid finding severity")));
  }

  try {
    // Resolve (and org-scope) the parent validation to derive the model link.
    const modelId = await getValidationModelIdQuery(validationId, req.organizationId!);
    if (modelId === null) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Validation not found")));
    }
    const created = await createFindingQuery(validationId, modelId, req.organizationId!, {
      title: title.trim(),
      severity,
      owner_id: owner_id ?? null,
      remediation_plan: remediation_plan ?? null,
      due_date: due_date ? new Date(due_date) : null,
    });
    logStructured("successful", `finding created for validation ${validationId}`, fn, FILE);
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    return fail(req, res, fn, "failed to create finding", error);
  }
}

export async function updateFinding(req: Request, res: Response) {
  const fn = "updateFinding";
  const id = parseId(req.params.id);
  const { stage, severity, owner_id, remediation_plan, due_date, closed_verified } = req.body ?? {};

  logStructured("processing", `updating finding ${id}`, fn, FILE);

  if (Number.isNaN(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid finding id")));
  }
  if (stage !== undefined && !Object.values(MrmFindingStage).includes(stage)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid finding stage")));
  }
  if (severity !== undefined && !Object.values(MrmFindingSeverity).includes(severity)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid finding severity")));
  }

  try {
    const existing = await getFindingByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Finding not found")));
    }
    // Close-with-verify guard: a finding can only be CLOSED once verified.
    if (stage === MrmFindingStage.CLOSED) {
      const willBeVerified =
        closed_verified !== undefined ? closed_verified === true : existing.closed_verified;
      if (!willBeVerified) {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("A finding must be verified before it can be closed")));
      }
    }

    const updated = await updateFindingQuery(id, req.organizationId!, {
      stage,
      severity,
      owner_id,
      remediation_plan,
      due_date: due_date !== undefined ? (due_date ? new Date(due_date) : null) : undefined,
      closed_verified,
    });
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Finding not found")));
    }
    logStructured("successful", `finding ${id} updated`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return fail(req, res, fn, "failed to update finding", error);
  }
}

// ---------------------------------------------------------------------------
// Per-model roles
// ---------------------------------------------------------------------------

export async function getModelRoles(req: Request, res: Response) {
  const fn = "getModelRoles";
  const modelId = parseId(req.params.modelId);
  logStructured("processing", `fetching roles for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }

  try {
    const rows = await getModelRolesQuery(modelId, req.organizationId!);
    logStructured("successful", `roles retrieved for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve model roles", error);
  }
}

/**
 * Full-replace of a model's role assignments (PUT semantics): the caller sends
 * the COMPLETE set of assignments, which atomically replaces all existing rows
 * for the model. Roles omitted from the payload are cleared. Because the payload
 * is always the complete set, the validator≠developer independence check below
 * only needs to inspect the incoming assignments — there is no stale prior state
 * to reconcile against.
 */
export async function setModelRoles(req: Request, res: Response) {
  const fn = "setModelRoles";
  const modelId = parseId(req.params.modelId);
  const assignmentsRaw = req.body?.assignments;

  logStructured("processing", `setting roles for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }
  if (!Array.isArray(assignmentsRaw)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("assignments must be an array")));
  }

  // Normalise + validate each assignment.
  const assignments: { role: MrmModelRole; user_id: number | null }[] = [];
  for (const a of assignmentsRaw) {
    if (!a || !Object.values(MrmModelRole).includes(a.role)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid role in assignments")));
    }
    const userId =
      a.user_id === null || a.user_id === undefined ? null : parseInt(String(a.user_id), 10);
    if (userId !== null && Number.isNaN(userId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid user id in assignments")));
    }
    assignments.push({ role: a.role, user_id: userId });
  }

  // Independence guard (soft, app-level): validator must not be the developer.
  const developerIds = new Set(
    assignments
      .filter((a) => a.role === MrmModelRole.DEVELOPER && a.user_id !== null)
      .map((a) => a.user_id),
  );
  const validatorClash = assignments.some(
    (a) => a.role === MrmModelRole.VALIDATOR && a.user_id !== null && developerIds.has(a.user_id),
  );
  if (validatorClash) {
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          req.t!("The validator must be independent — they cannot also be the developer"),
        ),
      );
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const rows = await setModelRolesQuery(modelId, req.organizationId!, assignments);
    logStructured("successful", `roles set for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to set model roles", error);
  }
}
