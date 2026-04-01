import { Request, Response } from "express";
import { getVendorRiskChangeHistory } from "../utils/vendorRiskChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Get change history for a specific vendor risk with pagination support
 */
export async function getVendorRiskChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const vendorRiskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  if (isNaN(vendorRiskId) || vendorRiskId <= 0) {
    return res.status(400).json(STATUS_CODE[400]("Invalid vendor risk ID"));
  }

  const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offsetParam = req.query.offset ? parseInt(req.query.offset as string) : 0;
  const limit = isNaN(limitParam) || limitParam < 0 ? 100 : Math.min(limitParam, 500);
  const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;

  logStructured(
    "processing",
    `fetching change history for vendor risk id: ${vendorRiskId} (limit: ${limit}, offset: ${offset})`,
    "getVendorRiskChangeHistoryById",
    "vendorRiskChangeHistory.ctrl.ts"
  );
  logger.debug(
    `Fetching change history for vendor risk with id: ${vendorRiskId} (limit: ${limit}, offset: ${offset})`
  );

  try {
    const result = await getVendorRiskChangeHistory(
      vendorRiskId,
      req.organizationId!,
      limit,
      offset
    );

    logStructured(
      "successful",
      `change history retrieved for vendor risk id: ${vendorRiskId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getVendorRiskChangeHistoryById",
      "vendorRiskChangeHistory.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getVendorRiskChangeHistoryById",
      "vendorRiskChangeHistory.ctrl.ts"
    );
    logger.error("Error in getVendorRiskChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
