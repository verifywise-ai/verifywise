import { Request, Response } from "express";
import { getModelInventoryChangeHistory } from "../utils/modelInventoryChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Get change history for a specific model inventory with pagination support
 */
export async function getModelInventoryChangeHistoryById(
  req: Request,
  res: Response
) {
  const modelInventoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const limit = req.query.limit ? parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit), 10) : 100;
    const offset = req.query.offset ? parseInt(Array.isArray(req.query.offset) ? String(req.query.offset[0]) : String(req.query.offset), 10) : 0;

  logStructured(
    "processing",
    `fetching change history for model inventory id: ${modelInventoryId} (limit: ${limit}, offset: ${offset})`,
    "getModelInventoryChangeHistoryById",
    "modelInventoryChangeHistory.ctrl.ts"
  );
  logger.debug(
    `🔍 Fetching change history for model inventory with id: ${modelInventoryId} (limit: ${limit}, offset: ${offset})`
  );

  try {
    const result = await getModelInventoryChangeHistory(
      modelInventoryId,
      req.organizationId!,
      limit,
      offset
    );

    logStructured(
      "successful",
      `change history retrieved for model inventory id: ${modelInventoryId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getModelInventoryChangeHistoryById",
      "modelInventoryChangeHistory.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getModelInventoryChangeHistoryById",
      "modelInventoryChangeHistory.ctrl.ts"
    );
    logger.error("❌ Error in getModelInventoryChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
