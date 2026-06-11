import { Request, Response } from "express";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getDeadlineSummaryQuery } from "../utils/deadline.utils";
import { translateError } from "../utils/i18n.utils";

const DEFAULT_DUE_SOON_DAYS = 7;

export async function getDeadlinesSummary(req: Request, res: Response) {
  logProcessing({
    description: "starting getDeadlinesSummary",
    functionName: "getDeadlinesSummary",
    fileName: "deadline.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const parsedDays = parseInt(req.query.days as string);
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : DEFAULT_DUE_SOON_DAYS;

    const summary = await getDeadlineSummaryQuery(req.organizationId!, days);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved deadline summary successfully",
      functionName: "getDeadlinesSummary",
      fileName: "deadline.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve deadline summary",
      functionName: "getDeadlinesSummary",
      fileName: "deadline.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
