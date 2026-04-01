import { Request, Response } from "express";
import { getUseCaseChangeHistory } from "../utils/useCaseChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

/**
 * Get change history for a specific use case
 */
export const getUseCaseHistory = async (req: Request, res: Response) => {
  try {
    const useCaseId = parseInt(Array.isArray(req.params.useCaseId) ? req.params.useCaseId[0] : req.params.useCaseId, 10);
    const limit = parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit || '100'), 10) || 100;
    const offset = parseInt(Array.isArray(req.query.offset) ? String(req.query.offset[0]) : String(req.query.offset || '0'), 10) || 0;

    if (isNaN(useCaseId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid use case ID"));
    }

    const result = await getUseCaseChangeHistory(
      useCaseId,
      req.organizationId!,
      limit,
      offset
    );

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    console.error("Error getting use case change history:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
