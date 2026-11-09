import { Request, Response } from "express";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

import { translateError } from "../utils/i18n.utils";
/**
 * Get change history for a specific evidence hub entry with pagination support
 * (issue #4977: the evidence_hub_change_history table is written since #4915
 * but had no read path).
 */
export async function getEvidenceHubChangeHistoryById(req: Request, res: Response): Promise<any> {
  const evidenceHubId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate evidence hub ID
  if (isNaN(evidenceHubId) || evidenceHubId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid evidence hub ID")));
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
  const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

  logStructured(
    "processing",
    `fetching change history for evidence hub id: ${evidenceHubId} (limit: ${limit}, offset: ${offset})`,
    "getEvidenceHubChangeHistoryById",
    "evidenceHubChangeHistory.ctrl.ts",
  );
  logger.debug(
    `Fetching change history for evidence hub with id: ${evidenceHubId} (limit: ${limit}, offset: ${offset})`,
  );

  try {
    const result = await getEntityChangeHistory(
      "evidence_hub",
      evidenceHubId,
      req.organizationId!,
      limit,
      offset,
    );

    logStructured(
      "successful",
      `change history retrieved for evidence hub id: ${evidenceHubId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
      "getEvidenceHubChangeHistoryById",
      "evidenceHubChangeHistory.ctrl.ts",
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve change history",
      "getEvidenceHubChangeHistoryById",
      "evidenceHubChangeHistory.ctrl.ts",
    );
    logger.error("Error in getEvidenceHubChangeHistoryById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
