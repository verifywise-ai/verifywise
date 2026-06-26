import { Request, Response } from "express";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  DEFAULT_DEADLINE_THRESHOLD_DAYS,
  getTasksDeadlineSummaryQuery,
} from "../utils/deadline.utils";
import { translateError } from "../utils/i18n.utils";

/**
 * GET /api/deadlines/summary
 *
 * Query params:
 *   - threshold: days from today to flag as "due soon" (default 14, clamped 1-365)
 *
 * Response:
 *   { tasks: { overdue: number, dueSoon: number, threshold: number } }
 *
 * Powers the deadline warning banner on the Tasks page. Counts respect
 * organization isolation and the same per-user visibility rules as
 * GET /api/tasks (Admin/SuperAdmin see all; others see creator/assignee).
 */
export async function getDeadlinesSummary(req: Request, res: Response) {
  logProcessing({
    description: "starting getDeadlinesSummary",
    functionName: "getDeadlinesSummary",
    fileName: "deadline.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const rawThreshold =
      req.query.threshold !== undefined ? Number(req.query.threshold) : undefined;
    const threshold =
      rawThreshold !== undefined && Number.isFinite(rawThreshold)
        ? rawThreshold
        : DEFAULT_DEADLINE_THRESHOLD_DAYS;

    const tasks = await getTasksDeadlineSummaryQuery({
      userId: req.userId!,
      role: req.role!,
      organizationId: req.organizationId!,
      threshold,
    });

    await logSuccess({
      eventType: "Read",
      description: "Retrieved deadline summary successfully",
      functionName: "getDeadlinesSummary",
      fileName: "deadline.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ tasks }));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve deadline summary",
      functionName: "getDeadlinesSummary",
      fileName: "deadline.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
