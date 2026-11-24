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
  validateScheduledReportParameters,
} from "../services/reporting/scheduledReportService";
import { parameterErrorMessages } from "../services/reporting/reportParameters";
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
import { assertReportScopeAllowed } from "../services/reporting/reportAuthorization";
import type { ReportViewer } from "../utils/reportVisibility.utils";

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
    // Sections and parameter answers are checked against the template
    // version: a kind's sections are refused outside it, and a schedule of a
    // kind template must carry every required answer except the period,
    // which each run derives.
    const parameters = await validateScheduledReportParameters({
      templateVersionId: req.body?.templateVersionId,
      organizationId: req.organizationId!,
      sectionsConfig: req.body?.sectionsConfig,
      reportParameters: req.body?.reportParameters,
      // The resolver derives a missing scope the same way.
      scope: req.body?.scope ?? (req.body?.projectId ? "project" : "organization"),
    });
    const errors = [
      ...validateScheduledReportInput(req.body, req.t),
      ...frameworkSelectionErrors(req.body?.frameworkIds),
      // await is load-bearing: see validateTemplateVersionOwnership's note.
      ...(await validateTemplateVersionOwnership(
        req.body?.templateId,
        req.body?.templateVersionId,
        req.organizationId!,
      )),
      ...parameterErrorMessages(parameters.errors, req.t),
    ];
    if (errors.length) return res.status(400).json(STATUS_CODE[400]({ errors }));

    // Authorization, not validation: organization scope is the union of every
    // project in the tenant, and a project-scoped report must not be
    // producible by someone who could not open it (canViewRunQuery denies
    // exactly that on the read side).
    const scopeErrors = await assertReportScopeAllowed({
      role: req.role ?? null,
      userId: req.userId!,
      organizationId: req.organizationId!,
      scope: req.body.scope,
      projectId: req.body.projectId,
    });
    if (scopeErrors.length) {
      return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
    }

    const row = await createScheduledReportQuery(
      { ...req.body, reportParameters: parameters.value },
      req.organizationId!,
      req.userId!,
    );
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

/**
 * The viewer, from the authenticated request only. Missing identity becomes
 * null, which matches no project owner or member, so such a caller sees
 * organization-wide schedules only.
 */
function reportViewer(req: Request): ReportViewer {
  return { userId: req.userId ?? null, role: req.role ?? null };
}

export async function listScheduledReports(req: Request, res: Response): Promise<any> {
  try {
    const rows = await listScheduledReportsQuery(req.organizationId!, reportViewer(req));
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * One schedule with its template version's parameters_config, so the edit
 * dialog knows which report details the schedule declares. Read access matches
 * listScheduledReports: a project schedule the caller may not read is a 404,
 * like a missing one. The write paths answer the same way (readableSchedule),
 * so no endpoint confirms that a schedule id exists.
 */
export async function getScheduledReport(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "getScheduledReport",
    functionName: "getScheduledReport",
    fileName: "scheduledReport.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
    }
    const row = await getScheduledReportQuery(id, req.organizationId!, reportViewer(req));
    if (!row) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "getScheduledReport failed",
      functionName: "getScheduledReport",
      fileName: "scheduledReport.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * The schedule a write acts on, as the caller sees it: null when it does not
 * exist in the organization OR the caller may not read it (the same rule as
 * GET, reportVisibility.utils). Every write treats both cases alike, so the
 * write endpoints do not reveal which schedule ids exist: run-now and PATCH
 * answer 404, pause, resume and delete a 200 no-op that writes nothing.
 * A 403 is left only for a schedule the caller can already see.
 */
async function readableSchedule(req: Request): Promise<any> {
  // A non-numeric id would reach SQL as NaN and fail; it is simply missing.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getScheduledReportQuery(id, req.organizationId!, reportViewer(req));
}

/**
 * The scope gate for a schedule the caller can see: they must be allowed to
 * produce a report of its scope (assertReportScopeAllowed), as create,
 * update, resume and run-now require.
 */
function scopeErrorsForSchedule(req: Request, sched: any): Promise<string[]> {
  return assertReportScopeAllowed({
    role: req.role ?? null,
    userId: req.userId!,
    organizationId: req.organizationId!,
    scope: sched.scope,
    projectId: sched.project_id,
  });
}

/**
 * Pause, resume and delete: a 200 no-op for a schedule the caller cannot see
 * (another organization's, a missing one, or one outside their projects —
 * tenant-isolation expects the cross-tenant case to stay "ok"), a 403 for one
 * they can see but may not change, and the write otherwise.
 */
async function writeVisibleSchedule(
  action: string,
  req: Request,
  res: Response,
  write: (id: number, organizationId: number) => Promise<void>,
): Promise<any> {
  try {
    const sched = await readableSchedule(req);
    if (sched) {
      const scopeErrors = await scopeErrorsForSchedule(req, sched);
      if (scopeErrors.length) {
        return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
      }
      await write(sched.id, req.organizationId!);
    }
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `${action} of scheduled report ${req.params.id} failed`,
      functionName: action,
      fileName: "scheduledReport.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function pauseScheduledReport(req: Request, res: Response): Promise<any> {
  return writeVisibleSchedule("pauseScheduledReport", req, res, (id, org) =>
    setActiveQuery(id, org, false),
  );
}

// Resuming re-enables delivery, so it is gated like create, PATCH and run-now.
export async function resumeScheduledReport(req: Request, res: Response): Promise<any> {
  return writeVisibleSchedule("resumeScheduledReport", req, res, (id, org) =>
    setActiveQuery(id, org, true),
  );
}

export async function deleteScheduledReport(req: Request, res: Response): Promise<any> {
  return writeVisibleSchedule("deleteScheduledReport", req, res, softDeleteQuery);
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

    // frameworkIds is allowlisted above, so a PATCH is a third write path into
    // framework_ids and needs the same gate as create and run-now. This is its
    // own check rather than part of the block below because that block only
    // runs when deliveryConfig/sectionsConfig are present — a PATCH carrying
    // frameworkIds alone would otherwise reach the UPDATE unvalidated.
    const frameworkErrors = frameworkSelectionErrors(input.frameworkIds);
    if (frameworkErrors.length) {
      return res.status(400).json(STATUS_CODE[400]({ errors: frameworkErrors }));
    }

    // scope and projectId have to be validated against the row as it will be
    // AFTER the patch, not against the patch alone. A PATCH of {scope:
    // "organization"} on its own used to skip validation entirely — and even
    // inside the block below, input.projectId is undefined for a field the
    // caller did not send, so the "organization scope must not set projectId"
    // rule passed while the stored project_id stayed put. The next run then
    // collected the whole tenant under an organization scope and emailed it to
    // the schedule's project-level recipients.
    //
    // The fetch itself must be unconditional, not gated on scope/projectId
    // being present: authorization below needs the row's CURRENT scope for
    // every PATCH, including one that touches only deliveryConfig. A PATCH
    // carrying just `{ deliveryConfig: { recipients: [...] } }` sends neither
    // scope nor projectId, but it can still redirect a project report's
    // recipients — and canViewRunQuery already refuses that same non-member
    // on the read side. Skipping the fetch (and therefore the authz check)
    // whenever scope/projectId are absent left exactly that path ungated.
    // A schedule the caller cannot read is a 404, like a missing one.
    const existing = await readableSchedule(req);
    if (!existing) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
    {
      const effectiveScope = input.scope ?? existing.scope;
      const effectiveProjectId =
        input.projectId !== undefined ? input.projectId : existing.project_id;

      // These invariant checks only make sense when the patch actually
      // touches scope or projectId — a patch that touches neither cannot
      // have introduced a new invariant violation (the stored row already
      // satisfied it), so it must not trip on values it never sent.
      if (input.scope !== undefined || input.projectId !== undefined) {
        const scopeErrors: string[] = [];
        if (effectiveScope === "project" && !effectiveProjectId) {
          scopeErrors.push("project scope requires projectId");
        }
        if (effectiveScope === "organization" && effectiveProjectId) {
          scopeErrors.push(
            "organization scope must not set projectId — clear projectId in the same request",
          );
        }
        if (scopeErrors.length) {
          return res.status(400).json(STATUS_CODE[400]({ errors: scopeErrors }));
        }
      }

      // The caller must be allowed to produce the schedule's CURRENT scope
      // too, not only the post-patch one: every member can see an
      // organization-wide schedule, and without this an Editor could move it
      // into a project of theirs and take over its delivery.
      const currentErrors = await scopeErrorsForSchedule(req, existing);
      if (currentErrors.length) {
        return res.status(403).json(STATUS_CODE[403]({ errors: currentErrors }));
      }

      // Authorization runs against the effective post-patch scope on EVERY
      // PATCH to an existing row, not only ones that touch scope/projectId.
      const authzErrors = await assertReportScopeAllowed({
        role: req.role ?? null,
        userId: req.userId!,
        organizationId: req.organizationId!,
        scope: effectiveScope,
        projectId: effectiveProjectId,
      });
      if (authzErrors.length) {
        return res.status(403).json(STATUS_CODE[403]({ errors: authzErrors }));
      }

      // New sections, answers or scope are checked against the schedule's
      // own template version, each against the stored value of the others
      // when only one is patched. The validated answers replace the raw ones.
      if (
        input.reportParameters !== undefined ||
        input.sectionsConfig !== undefined ||
        input.scope !== undefined
      ) {
        const parameters = await validateScheduledReportParameters({
          templateVersionId: existing.template_version_id,
          organizationId: req.organizationId!,
          sectionsConfig: input.sectionsConfig ?? existing.sections_config,
          reportParameters: input.reportParameters ?? existing.report_parameters,
          scope: effectiveScope,
        });
        if (parameters.errors.length) {
          return res
            .status(400)
            .json(STATUS_CODE[400]({ errors: parameterErrorMessages(parameters.errors, req.t) }));
        }
        if (input.reportParameters !== undefined) input.reportParameters = parameters.value;
      }
    }

    // Re-validate the delivery and schedule blocks if they are being replaced,
    // so a PATCH cannot smuggle in what create rejects (malformed recipients,
    // a quarterly schedule with no anchor month).
    if (
      input.deliveryConfig !== undefined ||
      input.sectionsConfig !== undefined ||
      input.scheduleConfig !== undefined
    ) {
      const errors = validateScheduledReportInput(
        {
          scope: input.scope ?? "organization",
          projectId: input.projectId,
          sectionsConfig: input.sectionsConfig ?? {
            sections: [{ reportSectionKey: "placeholder" }],
          },
          deliveryConfig: input.deliveryConfig ?? { saveToStorage: true },
          scheduleConfig: input.scheduleConfig ?? { frequency: "daily" },
        } as any,
        req.t,
      );
      if (errors.length) return res.status(400).json(STATUS_CODE[400]({ errors }));
    }

    const row = await updateScheduledReportQuery(Number(req.params.id), req.organizationId!, input);
    if (!row) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));
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
    // A schedule the caller cannot read is a 404, like a missing one.
    const sched = await readableSchedule(req);
    if (!sched) return res.status(404).json(STATUS_CODE[404](req.t!("not found")));

    const scopeErrors = await scopeErrorsForSchedule(req, sched);
    if (scopeErrors.length) {
      return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
    }

    await runScheduledReport(sched, { triggeredBy: "manual", userId: req.userId! });
    return res.status(202).json(STATUS_CODE[202]({ queued: true }));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `run-now of scheduled report ${req.params.id} failed`,
      functionName: "runScheduledReportNow",
      fileName: "scheduledReport.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
