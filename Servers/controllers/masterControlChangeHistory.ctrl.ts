import { Request, Response } from "express";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Controls Hub — GET change history for a single master control.
 *
 * Supports limit/offset pagination (defaults: limit=100, offset=0). Tenant
 * scoping is applied in `getEntityChangeHistory` via `req.organizationId`.
 */
export async function getMasterControlChangeHistoryById(
  req: Request,
  res: Response
): Promise<any> {
  const masterControlId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  if (isNaN(masterControlId) || masterControlId <= 0) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Invalid master control ID"));
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  logStructured(
    "processing",
    `fetching change history for master control id: ${masterControlId} (limit: ${limit}, offset: ${offset})`,
    "getMasterControlChangeHistoryById",
    "masterControlChangeHistory.ctrl.ts"
  );

  try {
    const result = await getEntityChangeHistory(
      "master_control",
      masterControlId,
      req.organizationId!,
      limit,
      offset
    );

    logStructured(
      "successful",
      `change history retrieved for master control id: ${masterControlId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getMasterControlChangeHistoryById",
      "masterControlChangeHistory.ctrl.ts"
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve master control change history",
      "getMasterControlChangeHistoryById",
      "masterControlChangeHistory.ctrl.ts"
    );
    logger.error("Error in getMasterControlChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
