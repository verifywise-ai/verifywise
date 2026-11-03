import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  deleteReportByIdQuery,
  getGeneratedReportsQuery,
  isReportFileSource,
  ReportFileSource,
} from "../utils/reporting.utils";
import { getOrganizationByIdQuery } from "../utils/organization.utils";
import { getUserByIdQuery } from "../utils/user.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";

import { translateError } from "../utils/i18n.utils";
// Reporting system imports (v2 - HTML/EJS based)
import { ReportFormat } from "../services/reporting";
import { createRunQuery, updateRunStatusQuery } from "../utils/reportRun.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import { MANUAL_REPORT_JOB } from "../services/reporting/reportJobConstants";

/**
 * The `files.source` a generated report is saved under. Always one of
 * REPORT_FILE_SOURCES, which the Reports list and the report delete filter on.
 */
export function mapReportTypeToFileSource(reportType: string | string[]): ReportFileSource {
  // Handle array of section keys (new frontend format)
  if (Array.isArray(reportType)) {
    if (reportType.length > 1) {
      return "All reports";
    }
    // Single-element array: unwrap and map below
    reportType = reportType[0] || "all";
  }

  // Map new backend section keys to report file sources
  const sectionKeyToFileSource: Record<string, ReportFileSource> = {
    projectRisks: "Project risks report",
    vendorRisks: "Vendors and risks report",
    modelRisks: "Models and risks report",
    compliance: "Compliance tracker report",
    assessment: "Assessment tracker report",
    clausesAndAnnexes: "Clauses and annexes report",
    nistSubcategories: "All reports",
    vendors: "Vendors and risks report",
    models: "Models and risks report",
    trainingRegistry: "Training registry report",
    policyManager: "Policy manager report",
    incidentManagement: "All reports",
    all: "All reports",
  };

  // Check new backend key format first
  if (Object.prototype.hasOwnProperty.call(sectionKeyToFileSource, reportType)) {
    return sectionKeyToFileSource[reportType];
  }

  // Legacy report type strings are the file sources themselves
  return isReportFileSource(reportType) ? reportType : "All reports";
}

/**
 * Legacy /generate-report endpoint wrapper — delegates to generateReportsV2.
 * As of the async pipeline, this returns 202 { runId } like v2 (no longer a
 * synchronous blob). Kept only so the old route path keeps resolving.
 */
export async function generateReports(req: Request, res: Response): Promise<any> {
  return generateReportsV2(req, res);
}

export async function getAllGeneratedReports(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllGeneratedReports",
    functionName: "getAllGeneratedReports",
    fileName: "reporting.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  logger.debug("📄 Fetching all generated reports");

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      await logFailure({
        eventType: "Read",
        description: "Unauthorized access attempt for getAllGeneratedReports",
        functionName: "getAllGeneratedReports",
        fileName: "reporting.ctrl.ts",
        error: new Error("Unauthorized"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(401).json(STATUS_CODE[401](req.t!("Unauthorized")));
    }

    const reports = await getGeneratedReportsQuery({ userId, role }, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description:
        reports && reports.length > 0
          ? `Retrieved ${reports.length} generated reports`
          : "No generated reports found",
      functionName: "getAllGeneratedReports",
      fileName: "reporting.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    // Return 200 with empty array if no reports, not 404
    // 404 should be reserved for "endpoint not found" or "specific resource not found"
    return res.status(200).json(STATUS_CODE[200](reports || []));
  } catch (error) {
    console.error("Error in getAllGeneratedReports:", error);
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve generated reports",
      functionName: "getAllGeneratedReports",
      fileName: "reporting.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteGeneratedReportById(req: Request, res: Response): Promise<any> {
  const reportId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteGeneratedReportById for report ID ${reportId}`,
    functionName: "deleteGeneratedReportById",
    fileName: "reporting.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  logger.debug(`🗑️ Deleting generated report ID ${reportId}`);

  try {
    // Only generated reports qualify: any other file in the organization
    // answers 404, the same as a missing id.
    const deleted = await deleteReportByIdQuery(reportId, req.organizationId!);
    if (!deleted) {
      await logFailure({
        eventType: "Delete",
        description: `Report not found: ID ${reportId}`,
        functionName: "deleteGeneratedReportById",
        fileName: "reporting.ctrl.ts",
        error: new Error("Report not found"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("Report not found")));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Successfully deleted generated report ID ${reportId}`,
      functionName: "deleteGeneratedReportById",
      fileName: "reporting.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](deleted));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete generated report ID ${reportId}`,
      functionName: "deleteGeneratedReportById",
      fileName: "reporting.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Generate reports using the new HTML/EJS-based system
 * Supports both PDF and DOCX formats with rich formatting
 */
export async function generateReportsV2(req: Request, res: Response): Promise<any> {
  const {
    projectId: projectIdRaw,
    reportType,
    frameworkId: frameworkIdRaw,
    reportName,
    projectFrameworkId: projectFrameworkIdRaw,
    format = "docx",
    aiEnhanced,
    llmKeyId,
  } = req.body;

  const projectId = parseInt(projectIdRaw);
  // A use case with no framework attached sends neither id. 0 rather than the
  // NaN parseInt gives back: it is the value the collector already treats as
  // "no pairing" (parseFrameworkSelection rejects 0, so no target resolves),
  // and it serialises into config_snapshot as a number instead of null.
  const toId = (raw: unknown) => {
    const parsed = parseInt(raw as string);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const frameworkId = toId(frameworkIdRaw);
  const projectFrameworkId = toId(projectFrameworkIdRaw);
  const userId = req.userId;
  const reportFormat: ReportFormat = format === "pdf" ? "pdf" : "docx";

  logProcessing({
    description: `enqueueing generateReportsV2 for project ID ${projectId}, report type: ${reportType}, format: ${reportFormat}`,
    functionName: "generateReportsV2",
    fileName: "reporting.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  let run: any = null;
  let enqueued = false;
  try {
    const user = await getUserByIdQuery(userId!);
    if (!user) {
      await logFailure({
        eventType: "Create",
        description: `User not found: ID ${userId}`,
        functionName: "generateReportsV2",
        fileName: "reporting.ctrl.ts",
        error: new Error("User not found"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    const organization = await getOrganizationByIdQuery(req.organizationId!);
    const organizationName = organization?.name || "VerifyWise";

    const request = {
      projectId,
      frameworkId,
      projectFrameworkId,
      reportType,
      reportName,
      format: reportFormat,
      branding: { organizationName },
      aiEnhanced: aiEnhanced === true,
      llmKeyId: llmKeyId ? parseInt(llmKeyId) : undefined,
    };

    run = await createRunQuery({
      organization_id: req.organizationId!,
      scheduled_report_id: null,
      template_id: null,
      template_version_id: null,
      triggered_by: "manual",
      triggered_by_user_id: userId!,
      // Manual runs have no template to decompose; store the assembled request
      // itself. (Scheduled runs store { sections_config, ai_blocks_config, ... }.)
      //
      // project_id is lifted to the top level because that is the only place
      // the visibility rule looks: reportRun.utils' RUN_PROJECT_ID_SQL reads
      // config_snapshot->>'project_id', and a NULL there means "organization
      // scope — visible to the whole org". Leaving the id nested under
      // `request` made every project report generated here readable and
      // downloadable by any member of the organization, project member or not.
      config_snapshot: { project_id: Number.isFinite(projectId) ? projectId : null, request },
      scheduled_for: null,
    });

    await enqueueAutomationAction(MANUAL_REPORT_JOB, {
      runId: run.id,
      request,
      userId: userId!,
      organizationId: req.organizationId!,
    });
    enqueued = true;

    await logSuccess({
      eventType: "Create",
      description: `Queued ${reportType} report (${reportFormat}) as run ${run.id} for project ID ${projectId}`,
      functionName: "generateReportsV2",
      fileName: "reporting.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(202).json(STATUS_CODE[202]({ runId: run.id }));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `Failed to queue ${reportType} report for project ID ${projectId}`,
      functionName: "generateReportsV2",
      fileName: "reporting.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    // Only unwind the run if the job never made it onto the queue. Once
    // enqueued, the worker owns the run's terminal status — a later failure
    // here (e.g. logSuccess throwing) must not race it back to 'failed'.
    if (run?.id && !enqueued) {
      await updateRunStatusQuery(run.id, req.organizationId!, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Failed to queue report",
      }).catch(() => {});
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
