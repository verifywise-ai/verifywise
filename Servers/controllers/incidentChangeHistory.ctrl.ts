import { Request, Response } from "express";
import { getIncidentChangeHistory } from "../utils/incidentChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

/**
 * Get change history for a specific incident
 */
export const getIncidentHistory = async (req: Request, res: Response) => {
  try {
    const incidentId = parseInt(Array.isArray(req.params.incidentId) ? req.params.incidentId[0] : req.params.incidentId, 10);
    const limit = parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit || '100'), 10) || 100;
    const offset = parseInt(Array.isArray(req.query.offset) ? String(req.query.offset[0]) : String(req.query.offset || '0'), 10) || 0;

    if (isNaN(incidentId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid incident ID"));
    }

    const result = await getIncidentChangeHistory(
      incidentId,
      req.organizationId!,
      limit,
      offset
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error getting incident change history:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
