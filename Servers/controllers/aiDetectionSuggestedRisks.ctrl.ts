/**
 * @fileoverview AI Detection Suggested Risks Controller
 *
 * HTTP handlers for what was done with the LLM-suggested risks of a scan:
 * added to the risk register (the risk is created and linked in one step),
 * ignored, or an ignore undone.
 *
 * @module controllers/aiDetectionSuggestedRisks
 */

import { Request, Response } from "express";
import { logProcessing, logSuccess, logFailure as logError } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { ConflictException } from "../domain.layer/exceptions/custom.exception";
import {
  addSuggestedRiskToRegister,
  deleteSuggestedRiskAction,
  listSuggestedRiskActions,
  recordSuggestedRiskAction,
} from "../services/aiDetectionSuggestedRisks.service";
import { buildServiceContext, handleException } from "./aiDetection.ctrl";
import { runRiskCreatedSideEffects } from "./risks.ctrl";

const FILE_NAME = "aiDetectionSuggestedRisks.ctrl.ts";

function parseIdParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

/**
 * GET /ai-detection/scans/:scanId/suggested-risks/actions
 */
export async function listSuggestedRiskActionsController(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const scanId = parseIdParam(req.params.scanId);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid scan ID")));
    }
    const actions = await listSuggestedRiskActions(scanId, buildServiceContext(req));
    return res.status(200).json(STATUS_CODE[200](actions));
  } catch (error) {
    return handleException(req, res, error);
  }
}

/**
 * POST /ai-detection/scans/:scanId/suggested-risks/risks
 * Body: the risk, as for POST /projectRisks, plus suggestion_name (the
 * suggested risk's name as listed on the scan).
 *
 * Creates the risk and links it to the suggestion in one transaction.
 * 201 with the created risk; 409 with `risk_id` when the suggestion is
 * already linked to a risk that still exists.
 */
export async function addSuggestedRiskToRegisterController(
  req: Request,
  res: Response,
): Promise<Response> {
  logProcessing({
    description: "Adding suggested risk to the risk register",
    functionName: "addSuggestedRiskToRegisterController",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const scanId = parseIdParam(req.params.scanId);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid scan ID")));
    }
    const { suggestion_name: suggestionName, ...riskInput } = req.body ?? {};
    const risk = await addSuggestedRiskToRegister(
      scanId,
      suggestionName,
      riskInput,
      buildServiceContext(req),
    );

    await runRiskCreatedSideEffects(risk, req);
    await logSuccess({
      eventType: "Create",
      description: `Added suggested risk to the risk register from scan ${scanId} (risk ${risk.id})`,
      functionName: "addSuggestedRiskToRegisterController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](risk));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Create",
      description: "Failed to add suggested risk to the risk register",
      functionName: "addSuggestedRiskToRegisterController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    if (error instanceof ConflictException) {
      return res.status(409).json({
        ...STATUS_CODE[409](translateError(req, error)),
        risk_id: error.metadata.riskId ?? null,
      });
    }
    return handleException(req, res, error);
  }
}

/**
 * PUT /ai-detection/scans/:scanId/suggested-risks/actions
 * Body: { risk_name, action: "ignored", reason }
 */
export async function recordSuggestedRiskActionController(
  req: Request,
  res: Response,
): Promise<Response> {
  logProcessing({
    description: "Recording suggested risk action",
    functionName: "recordSuggestedRiskActionController",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const scanId = parseIdParam(req.params.scanId);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid scan ID")));
    }
    const actions = await recordSuggestedRiskAction(
      scanId,
      req.body ?? {},
      buildServiceContext(req),
    );

    await logSuccess({
      eventType: "Update",
      description: `Recorded suggested risk action on scan ${scanId}`,
      functionName: "recordSuggestedRiskActionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](actions));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Update",
      description: "Failed to record suggested risk action",
      functionName: "recordSuggestedRiskActionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return handleException(req, res, error);
  }
}

/**
 * DELETE /ai-detection/scans/:scanId/suggested-risks/actions/:actionId
 */
export async function deleteSuggestedRiskActionController(
  req: Request,
  res: Response,
): Promise<Response> {
  logProcessing({
    description: "Restoring ignored suggested risk",
    functionName: "deleteSuggestedRiskActionController",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const scanId = parseIdParam(req.params.scanId);
    const actionId = parseIdParam(req.params.actionId);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid scan ID")));
    }
    if (isNaN(actionId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid action ID")));
    }
    const actions = await deleteSuggestedRiskAction(scanId, actionId, buildServiceContext(req));

    await logSuccess({
      eventType: "Delete",
      description: `Restored ignored suggestion ${actionId} on scan ${scanId}`,
      functionName: "deleteSuggestedRiskActionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](actions));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Delete",
      description: "Failed to restore ignored suggestion",
      functionName: "deleteSuggestedRiskActionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return handleException(req, res, error);
  }
}
