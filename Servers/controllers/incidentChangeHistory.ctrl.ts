import { Request, Response } from "express";
import { getIncidentChangeHistory } from "../utils/incidentChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { MAX_HISTORY_LIMIT, historyPageNumber } from "../utils/historyPaging.utils";

/**
 * Get change history for a specific incident
 */
export const getIncidentHistory = async (req: Request, res: Response) => {
  try {
    const incidentId = parseInt(
      Array.isArray(req.params.incidentId) ? req.params.incidentId[0] : req.params.incidentId,
      10,
    );
    if (isNaN(incidentId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid incident ID")));
    }

    const limit = historyPageNumber(req.query.limit, {
      fallback: MAX_HISTORY_LIMIT,
      min: 1,
      max: MAX_HISTORY_LIMIT,
    });
    if (limit === null) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("limit must be an integer from 1 to 100")));
    }
    const offset = historyPageNumber(req.query.offset, {
      fallback: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    if (offset === null) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("offset must be a whole number of 0 or more")));
    }

    const result = await getIncidentChangeHistory(incidentId, req.organizationId!, limit, offset);

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error getting incident change history:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};
