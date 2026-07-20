/**
 * @fileoverview Scheduled Reports Controller
 *
 * Handles HTTP requests for the enterprise reporting scheduled-reports domain:
 * create, list, pause/resume, delete (soft), and run-now.
 *
 * All endpoints require JWT authentication and are org-scoped via
 * req.organizationId. Write endpoints are additionally RBAC-gated at the route.
 *
 * @module controllers/scheduledReport
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logFailure } from "../utils/logger/logHelper";
import {
  validateScheduledReportInput,
  validateTemplateVersionOwnership,
} from "../services/reporting/scheduledReportService";
import {
  createScheduledReportQuery,
  listScheduledReportsQuery,
  getScheduledReportQuery,
  setActiveQuery,
  softDeleteQuery,
} from "../utils/scheduledReport.utils";
import { runScheduledReport } from "../services/reporting/reportRunOrchestrator";

export async function createScheduledReport(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "createScheduledReport",
    functionName: "createScheduledReport",
    fileName: "scheduledReport.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const errors = [
      ...validateScheduledReportInput(req.body),
      // await is load-bearing: see validateTemplateVersionOwnership's note.
      ...(await validateTemplateVersionOwnership(
        req.body?.templateId,
        req.body?.templateVersionId,
        req.organizationId!,
      )),
    ];
    if (errors.length) return res.status(400).json(STATUS_CODE[400]({ errors }));
    const row = await createScheduledReportQuery(req.body, req.organizationId!, req.userId!);
    return res.status(201).json(STATUS_CODE[201](row));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "createScheduledReport failed",
      functionName: "createScheduledReport",
      fileName: "scheduledReport.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function listScheduledReports(req: Request, res: Response): Promise<any> {
  try {
    const rows = await listScheduledReportsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function pauseScheduledReport(req: Request, res: Response): Promise<any> {
  try {
    await setActiveQuery(Number(req.params.id), req.organizationId!, false);
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function resumeScheduledReport(req: Request, res: Response): Promise<any> {
  try {
    await setActiveQuery(Number(req.params.id), req.organizationId!, true);
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteScheduledReport(req: Request, res: Response): Promise<any> {
  try {
    await softDeleteQuery(Number(req.params.id), req.organizationId!);
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function runScheduledReportNow(req: Request, res: Response): Promise<any> {
  try {
    const sched = await getScheduledReportQuery(Number(req.params.id), req.organizationId!);
    if (!sched) return res.status(404).json(STATUS_CODE[404]("not found"));
    await runScheduledReport(sched, { triggeredBy: "manual", userId: req.userId! });
    return res.status(202).json(STATUS_CODE[202]({ queued: true }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
