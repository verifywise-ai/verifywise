import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { CustomException } from "../domain.layer/exceptions/custom.exception";
import { MrmRevalidationTriggerSource } from "../domain.layer/enums/mrmMonitoring.enum";
import { modelExistsForOrgQuery } from "../utils/mrm.utils";
import { triggerRevalidation } from "../utils/mrmRevalidation.utils";
import { getRevalidationEventsQuery } from "../utils/mrmRevalidationEvents.utils";
import { getAttestationSummary } from "../utils/mrmAttestation.utils";
import { generateAttestationReport } from "../services/reporting/mrmAttestationReport";
import { runRevalidationSweep } from "../services/automations/actions/mrmRevalidationSweep";
import { getOrganizationByIdQuery } from "../utils/organization.utils";

const FILE = "mrmRevalidation.ctrl.ts";

/**
 * Map a domain CustomException to its HTTP status, otherwise 500. Mirrors the
 * mrm.ctrl.ts / mrmMonitoring.ctrl.ts fail() dispatcher exactly.
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
// Material-change trigger (explicit "request revalidation" action)
// ---------------------------------------------------------------------------

/**
 * Explicit material-change trigger. The manual "mark change material / request
 * revalidation" action — materiality is a human decision, never auto-guessed.
 * Fires the unified trigger util which either opens a new revalidation task or
 * annotates the already-open one (dedup), always recording an audit event.
 */
export async function requestRevalidation(req: Request, res: Response) {
  const fn = "requestRevalidation";
  const modelId = parseId(req.params.modelId);
  const { reason } = req.body ?? {};

  logStructured("processing", `requesting revalidation for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A reason is required")));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }

    const result = await triggerRevalidation(
      req.organizationId!,
      modelId,
      MrmRevalidationTriggerSource.MATERIAL_CHANGE,
      reason.trim(),
      { requested_by: req.userId ?? null },
    );

    logStructured(
      "successful",
      `revalidation ${result.created_validation ? "opened" : "annotated"} for model ${modelId}`,
      fn,
      FILE,
    );
    // 201 only when a new task was created; 200 when an existing open task was
    // annotated (no new resource created).
    return result.created_validation
      ? res.status(201).json(STATUS_CODE[201](result))
      : res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    return fail(req, res, fn, "failed to request revalidation", error);
  }
}

// ---------------------------------------------------------------------------
// Revalidation-events audit read
// ---------------------------------------------------------------------------

/** Per-model revalidation-trigger firing history (append-only audit log). */
export async function getRevalidationEvents(req: Request, res: Response) {
  const fn = "getRevalidationEvents";
  const modelId = parseId(req.params.modelId);
  logStructured("processing", `fetching revalidation events for model ${modelId}`, fn, FILE);

  if (Number.isNaN(modelId)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid model id")));
  }

  try {
    if (!(await modelExistsForOrgQuery(modelId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model not found")));
    }
    const rows = await getRevalidationEventsQuery(req.organizationId!, modelId);
    logStructured("successful", `revalidation events retrieved for model ${modelId}`, fn, FILE);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return fail(req, res, fn, "failed to retrieve revalidation events", error);
  }
}

// ---------------------------------------------------------------------------
// Manual scheduled-sweep trigger (the BullMQ daily job also calls the same sweep)
// ---------------------------------------------------------------------------

/**
 * Run the due-date revalidation sweep for THIS org on demand. The same sweep
 * runs automatically as a BullMQ daily job across all orgs; this endpoint lets
 * an admin fire it for their own org (e.g. after adjusting due dates).
 */
export async function runRevalidationSweepForOrg(req: Request, res: Response) {
  const fn = "runRevalidationSweepForOrg";
  logStructured("processing", "running revalidation sweep", fn, FILE);
  try {
    const summary = await runRevalidationSweep(req.organizationId!);
    logStructured("successful", "revalidation sweep completed", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return fail(req, res, fn, "failed to run revalidation sweep", error);
  }
}

// ---------------------------------------------------------------------------
// Attestation / portfolio roll-up
// ---------------------------------------------------------------------------

/** Fleet attestation roll-up: tiers, validation coverage, findings, per-tier status. */
export async function getAttestationSummaryHandler(req: Request, res: Response) {
  const fn = "getAttestationSummaryHandler";
  logStructured("processing", "building attestation summary", fn, FILE);
  try {
    const summary = await getAttestationSummary(req.organizationId!);
    logStructured("successful", "attestation summary built", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return fail(req, res, fn, "failed to build attestation summary", error);
  }
}

/** Generate the attestation report (DOCX) — the board/examiner artifact. */
export async function generateAttestationReportHandler(req: Request, res: Response) {
  const fn = "generateAttestationReportHandler";
  logStructured("processing", "generating attestation report", fn, FILE);
  try {
    const summary = await getAttestationSummary(req.organizationId!);
    const org = await getOrganizationByIdQuery(req.organizationId!);
    const orgName = org?.name ?? "Organization";
    const report = await generateAttestationReport(orgName, summary);

    logStructured("successful", "attestation report generated", fn, FILE);
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.setHeader("Content-Type", report.mimeType);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    return res.status(200).send(report.content);
  } catch (error) {
    return fail(req, res, fn, "failed to generate attestation report", error);
  }
}
