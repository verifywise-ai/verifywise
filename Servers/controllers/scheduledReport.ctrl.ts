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
  updateScheduledReportQuery,
  UPDATABLE_FIELDS,
} from "../utils/scheduledReport.utils";
import { runScheduledReport } from "../services/reporting/reportRunOrchestrator";
import { parseFrameworkSelection } from "../services/reporting/frameworkSelection";

/**
 * An unparseable framework entry must not reach the column. An empty selection
 * means EVERY framework in scope, so a typo'd "iso42001" that got dropped
 * silently would widen the schedule to everything with nothing in the report to
 * say so. Returned as a message list to match this endpoint's 400 shape.
 */
function frameworkSelectionErrors(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return ["frameworkIds must be an array"];
  const invalid = parseFrameworkSelection(raw).invalid;
  return invalid.length ? [`unrecognised framework selection: ${invalid.join(", ")}`] : [];
}

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
      ...frameworkSelectionErrors(req.body?.frameworkIds),
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

export async function updateScheduledReport(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "updateScheduledReport",
    functionName: "updateScheduledReport",
    fileName: "scheduledReport.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const body = req.body ?? {};
    // The allowlist is applied here, not only in the query builder, so that
    // organization_id, template_id, template_version_id and created_by never
    // reach the UPDATE at all — a PATCH cannot move a schedule between tenants.
    const input: Record<string, any> = {};
    for (const key of Object.keys(UPDATABLE_FIELDS)) {
      if (body[key] !== undefined) input[key] = body[key];
    }
    if (!Object.keys(input).length) {
      return res.status(400).json(STATUS_CODE[400]({ errors: ["no updatable fields supplied"] }));
    }

    // Re-validate the delivery block if it is being replaced, so a PATCH
    // cannot smuggle in the malformed recipients that create rejects.
    if (input.deliveryConfig !== undefined || input.sectionsConfig !== undefined) {
      const errors = validateScheduledReportInput({
        scope: input.scope ?? "organization",
        projectId: input.projectId,
        sectionsConfig: input.sectionsConfig ?? { sections: [{ reportSectionKey: "placeholder" }] },
        deliveryConfig: input.deliveryConfig ?? { saveToStorage: true },
      } as any);
      if (errors.length) return res.status(400).json(STATUS_CODE[400]({ errors }));
    }

    const row = await updateScheduledReportQuery(Number(req.params.id), req.organizationId!, input);
    if (!row) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "updateScheduledReport failed",
      functionName: "updateScheduledReport",
      fileName: "scheduledReport.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
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
