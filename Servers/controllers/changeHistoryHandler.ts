import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";

export interface ChangeHistoryPage {
  data: unknown[];
  hasMore: boolean;
  total?: number;
}

/**
 * Builds a GET /:id change-history handler: validates the id, clamps
 * limit (1..500, default 100) and offset (>= 0), logs, and answers 400, 200
 * or 500. `fetchHistory` reads one tenant-scoped page.
 */
export const createChangeHistoryHandler =
  (options: {
    subject: string;
    invalidIdMessage: string;
    functionName: string;
    fileName: string;
    fetchHistory: (
      organizationId: number,
      id: number,
      limit: number,
      offset: number,
    ) => Promise<ChangeHistoryPage>;
  }) =>
  async (req: Request, res: Response): Promise<any> => {
    const { subject, invalidIdMessage, functionName, fileName, fetchHistory } = options;
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!(invalidIdMessage)));
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    logProcessing({
      description: `fetching ${subject} change history for id: ${id} (limit: ${limit}, offset: ${offset})`,
      functionName,
      fileName,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    try {
      const result = await fetchHistory(req.organizationId!, id, limit, offset);

      await logSuccess({
        eventType: "Read",
        description: `${subject} change history retrieved for id: ${id} (${result.data.length} entries, hasMore: ${result.hasMore})`,
        functionName,
        fileName,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](result));
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: `failed to retrieve ${subject} change history`,
        functionName,
        fileName,
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(500).json(STATUS_CODE[500](req.t!("Failed to retrieve change history")));
    }
  };
