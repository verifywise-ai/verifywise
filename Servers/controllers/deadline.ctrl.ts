/**
 * Deadline summary controller.
 *
 * GET /api/deadlines/summary
 *   Query: ?threshold=<days>  (optional, defaults to 14)
 *   Response: { tasks: { overdue: number, dueSoon: number, threshold: number } }
 */

import { Request, Response } from "express";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import {
  DEFAULT_DUE_SOON_THRESHOLD_DAYS,
  getTaskDeadlineSummaryQuery,
} from "../utils/deadline.utils";

const FILE_NAME = "deadline.ctrl.ts";

/**
 * Parse the threshold query parameter. Accepts both `?threshold=` (per the spec)
 * and `?days=` (legacy alias used by some clients). Falls back to the default
 * when missing or not a positive integer.
 */
function parseThresholdDays(req: Request): number {
  const raw = (req.query.threshold ?? req.query.days) as string | undefined;
  if (typeof raw !== "string") return DEFAULT_DUE_SOON_THRESHOLD_DAYS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DUE_SOON_THRESHOLD_DAYS;
  return parsed;
}

export async function getDeadlinesSummary(req: Request, res: Response) {
  logProcessing({
    description: "starting getDeadlinesSummary",
    functionName: "getDeadlinesSummary",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const thresholdDays = parseThresholdDays(req);

    const tasks = await getTaskDeadlineSummaryQuery({
      userId: req.userId!,
      role: req.role ?? "",
      organizationId: req.organizationId!,
      thresholdDays,
    });

    await logSuccess({
      eventType: "Read",
      description: "Retrieved deadline summary successfully",
      functionName: "getDeadlinesSummary",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ tasks }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve deadline summary",
      functionName: "getDeadlinesSummary",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
