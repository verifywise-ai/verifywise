/**
 * @fileoverview AI Detection Suppression Controller
 *
 * HTTP handlers for suppression-rule CRUD endpoints.
 *
 * @module controllers/aiDetectionSuppression
 */

import { Request, Response } from "express";
import { logProcessing, logSuccess, logFailure as logError } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  ValidationException,
  NotFoundException,
  BusinessLogicException,
  ExternalServiceException,
} from "../domain.layer/exceptions/custom.exception";
import { IServiceContext } from "../domain.layer/interfaces/i.aiDetection";
import {
  createSuppression,
  listSuppressions,
  deleteSuppression,
} from "../services/aiDetectionSuppression.service";

const FILE_NAME = "aiDetectionSuppression.ctrl.ts";

function buildServiceContext(req: Request): IServiceContext {
  return {
    userId: req.userId!,
    role: req.role!,
    organizationId: req.organizationId!,
  };
}

function handleException(res: Response, error: unknown): Response {
  if (error instanceof ValidationException) {
    return res.status(400).json(STATUS_CODE[400](error.message));
  }
  if (error instanceof NotFoundException) {
    return res.status(404).json(STATUS_CODE[404](error.message));
  }
  if (error instanceof BusinessLogicException) {
    return res.status(422).json(STATUS_CODE[422](error.message));
  }
  if (error instanceof ExternalServiceException) {
    return res.status(502).json(STATUS_CODE[502](error.message));
  }

  const errorMessage =
    process.env.NODE_ENV === "production"
      ? "An internal error occurred"
      : error instanceof Error
        ? error.message
        : "Unknown error";
  return res.status(500).json(STATUS_CODE[500](errorMessage));
}

/**
 * POST /ai-detection/suppressions
 * Body: { match_type, field, value, reason?, expires_at? }
 */
export async function createSuppressionController(req: Request, res: Response): Promise<Response> {
  logProcessing({
    description: "Creating AI detection suppression rule",
    functionName: "createSuppressionController",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const ctx = buildServiceContext(req);
    const rule = await createSuppression(req.body, ctx);

    await logSuccess({
      eventType: "Create",
      description: `Created suppression rule ${rule.id}`,
      functionName: "createSuppressionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](rule));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Create",
      description: "Failed to create suppression rule",
      functionName: "createSuppressionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return handleException(res, error);
  }
}

/**
 * GET /ai-detection/suppressions
 * Query: ?include_expired=true
 */
export async function listSuppressionsController(req: Request, res: Response): Promise<Response> {
  try {
    const ctx = buildServiceContext(req);
    const includeExpired = req.query.include_expired === "true";
    const rules = await listSuppressions(ctx, { includeExpired });
    return res.status(200).json(STATUS_CODE[200](rules));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * DELETE /ai-detection/suppressions/:id
 */
export async function deleteSuppressionController(req: Request, res: Response): Promise<Response> {
  logProcessing({
    description: "Deleting AI detection suppression rule",
    functionName: "deleteSuppressionController",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid suppression rule ID"));
    }

    const ctx = buildServiceContext(req);
    await deleteSuppression(id, ctx);

    await logSuccess({
      eventType: "Delete",
      description: `Deleted suppression rule ${id}`,
      functionName: "deleteSuppressionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ id }));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Delete",
      description: "Failed to delete suppression rule",
      functionName: "deleteSuppressionController",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return handleException(res, error);
  }
}
