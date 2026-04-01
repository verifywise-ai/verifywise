import { Request, Response } from "express";
import { getVendorChangeHistory } from "../utils/vendorChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Get change history for a specific vendor with pagination support
 */
export async function getVendorChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const vendorId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate vendor ID
  if (isNaN(vendorId) || vendorId <= 0) {
    return res.status(400).json(STATUS_CODE[400]("Invalid vendor ID"));
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  logStructured(
    "processing",
    `fetching change history for vendor id: ${vendorId} (limit: ${limit}, offset: ${offset})`,
    "getVendorChangeHistoryById",
    "vendorChangeHistory.ctrl.ts"
  );
  logger.debug(
    `Fetching change history for vendor with id: ${vendorId} (limit: ${limit}, offset: ${offset})`
  );

  try {
    const result = await getVendorChangeHistory(
      vendorId,
      req.organizationId!,
      limit,
      offset
    );

    logStructured(
      "successful",
      `change history retrieved for vendor id: ${vendorId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getVendorChangeHistoryById",
      "vendorChangeHistory.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getVendorChangeHistoryById",
      "vendorChangeHistory.ctrl.ts"
    );
    logger.error("Error in getVendorChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
