/**
 * @fileoverview AI Detection Suggested Risks Controller
 *
 * HTTP handlers for recording what was done with the LLM-suggested risks of
 * a scan (added to the risk register, ignored, or an ignore undone).
 *
 * @module controllers/aiDetectionSuggestedRisks
 */

import { Request, Response } from "express";
import { logProcessing, logSuccess, logFailure as logError } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import {
  ValidationException,
  NotFoundException,
  BusinessLogicException,
} from "../domain.layer/exceptions/custom.exception";
import { IServiceContext } from "../domain.layer/interfaces/i.aiDetection";
import {
  deleteSuggestedRiskAction,
  listSuggestedRiskActions,
  recordSuggestedRiskAction,
} from "../services/aiDetectionSuggestedRisks.service";

const FILE_NAME = "aiDetectionSuggestedRisks.ctrl.ts";

function buildServiceContext(req: Request): IServiceContext {
  return {
    userId: req.userId!,
    role: req.role!,
    organizationId: req.organizationId!,
  };
}

function parseIdParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

function handleException(req: Request, res: Response, error: unknown): Response {
  if (error instanceof ValidationException) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
  if (error instanceof NotFoundException) {
    return res.status(404).json(STATUS_CODE[404](translateError(req, error)));
  }
  if (error instanceof BusinessLogicException) {
    return res.status(409).json(STATUS_CODE[409](translateError(req, error)));
  }
  return res.status(500).json(STATUS_CODE[500](req.t!("An internal error occurred")));
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
 * PUT /ai-detection/scans/:scanId/suggested-risks/actions
 * Body: { risk_name, action: "added", risk_id } | { risk_name, action: "ignored", reason }
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
