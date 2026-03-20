import { Request, Response } from "express";
import { getPolicyChangeHistory } from "../utils/policyChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Get change history for a specific policy with pagination support
 */
export async function getPolicyChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const policyId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  if (isNaN(policyId) || policyId <= 0) {
    return res.status(400).json(STATUS_CODE[400]("Invalid policy ID"));
  }

  const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offsetParam = req.query.offset ? parseInt(req.query.offset as string) : 0;
  const limit = isNaN(limitParam) || limitParam < 0 ? 100 : Math.min(limitParam, 500);
  const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;

  logStructured(
    "processing",
    `fetching change history for policy id: ${policyId} (limit: ${limit}, offset: ${offset})`,
    "getPolicyChangeHistoryById",
    "policyChangeHistory.ctrl.ts"
  );
  logger.debug(
    `Fetching change history for policy with id: ${policyId} (limit: ${limit}, offset: ${offset})`
  );

  try {
    const result = await getPolicyChangeHistory(
      policyId,
      req.organizationId!,
      limit,
      offset
    );

    logStructured(
      "successful",
      `change history retrieved for policy id: ${policyId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getPolicyChangeHistoryById",
      "policyChangeHistory.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getPolicyChangeHistoryById",
      "policyChangeHistory.ctrl.ts"
    );
    logger.error("Error in getPolicyChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
