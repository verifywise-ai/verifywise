import { Request, Response } from "express";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";

/**
 * Get change history for a specific model risk with pagination support
 */
export async function getModelRiskChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const modelRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  if (isNaN(modelRiskId) || modelRiskId <= 0) {
    return res.status(400).json(STATUS_CODE[400]("Invalid model risk ID"));
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  logProcessing({
    description: `fetching change history for model risk id: ${modelRiskId} (limit: ${limit}, offset: ${offset})`,
    functionName: "getModelRiskChangeHistoryById",
    fileName: "modelRiskChangeHistory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const result = await getEntityChangeHistory(
      "model_risk",
      modelRiskId,
      req.organizationId!,
      limit,
      offset
    );

    await logSuccess({
      eventType: "Read",
      description: `change history retrieved for model risk id: ${modelRiskId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      functionName: "getModelRiskChangeHistoryById",
      fileName: "modelRiskChangeHistory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve change history",
      functionName: "getModelRiskChangeHistoryById",
      fileName: "modelRiskChangeHistory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Failed to retrieve change history"));
  }
}
