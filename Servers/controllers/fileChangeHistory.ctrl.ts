import { Request, Response } from "express";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Get change history for a specific file with pagination support
 */
export async function getFileChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const fileId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate file ID
  if (isNaN(fileId) || fileId <= 0) {
    return res.status(400).json(STATUS_CODE[400]("Invalid file ID"));
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  logStructured(
    "processing",
    `fetching change history for file id: ${fileId} (limit: ${limit}, offset: ${offset})`,
    "getFileChangeHistoryById",
    "fileChangeHistory.ctrl.ts"
  );
  logger.debug(
    `Fetching change history for file with id: ${fileId} (limit: ${limit}, offset: ${offset})`
  );

  try {
    const result = await getEntityChangeHistory(
      "file",
      fileId,
      req.organizationId!,
      limit,
      offset
    );

    logStructured(
      "successful",
      `change history retrieved for file id: ${fileId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getFileChangeHistoryById",
      "fileChangeHistory.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getFileChangeHistoryById",
      "fileChangeHistory.ctrl.ts"
    );
    logger.error("Error in getFileChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
