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
import { assertReportScopeAllowed } from "../services/reporting/reportAuthorization";

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
    // Resuming re-enables delivery, so it needs the same scope gate as
    // create/patch/run-now — but only for a row that actually exists in the
    // caller's organization. pause/resume/delete are deliberately a 200
    // no-op for a cross-tenant id (the org-scoped WHERE in setActiveQuery
    // matches nothing and the caller is still told "ok" — see
    // tests/integration/tenant-isolation/scheduled-reports.isolation.test.ts,
    // "makes a cross-tenant resume a no-op on a paused schedule"), so a
    // 404/403 here must not fire for a row this organization_id can't see in
    // the first place; it only guards a same-tenant caller who is not
    // authorized for the row's scope.
    const sched = await getScheduledReportQuery(Number(req.params.id), req.organizationId!);
    if (sched) {
      const scopeErrors = await assertReportScopeAllowed({
        role: req.role ?? null,
        userId: req.userId!,
        organizationId: req.organizationId!,
        scope: sched.scope,
        projectId: sched.project_id,
      });
      if (scopeErrors.length) {
        return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
      }
    }

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
    const existing = await getScheduledReportQuery(Number(req.params.id), req.organizationId!);
    if (existing) {
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

    const scopeErrors = await assertReportScopeAllowed({
      role: req.role ?? null,
      userId: req.userId!,
      organizationId: req.organizationId!,
      scope: sched.scope,
      projectId: sched.project_id,
    });
    if (scopeErrors.length) {
      return res.status(403).json(STATUS_CODE[403]({ errors: scopeErrors }));
    }

    await runScheduledReport(sched, { triggeredBy: "manual", userId: req.userId! });
    return res.status(202).json(STATUS_CODE[202]({ queued: true }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
