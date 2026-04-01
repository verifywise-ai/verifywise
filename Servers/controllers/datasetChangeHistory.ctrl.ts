import { Request, Response } from "express";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";

/**
 * Get change history for a specific dataset with pagination support
 */
export async function getDatasetChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const datasetId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  if (isNaN(datasetId) || datasetId <= 0) {
    return res.status(400).json(STATUS_CODE[400]("Invalid dataset ID"));
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  logProcessing({
    description: `fetching change history for dataset id: ${datasetId} (limit: ${limit}, offset: ${offset})`,
    functionName: "getDatasetChangeHistoryById",
    fileName: "datasetChangeHistory.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const result = await getEntityChangeHistory(
      "dataset",
      datasetId,
      req.organizationId!,
      limit,
      offset
    );

    await logSuccess({
      eventType: "Read",
      description: `change history retrieved for dataset id: ${datasetId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      functionName: "getDatasetChangeHistoryById",
      fileName: "datasetChangeHistory.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "failed to retrieve change history",
      functionName: "getDatasetChangeHistoryById",
      fileName: "datasetChangeHistory.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]("Failed to retrieve change history"));
  }
}
