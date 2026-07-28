/**
 * @fileoverview Report Templates Controller
 *
 * Read-only endpoints for the enterprise reporting template catalog:
 * list system + org templates, and fetch one template with its latest version.
 *
 * All endpoints require JWT authentication and are org-scoped via
 * req.organizationId.
 *
 * @module controllers/reportTemplate
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  getTemplatesQuery,
  getTemplateByIdQuery,
  getLatestVersionQuery,
  createTemplateQuery,
  updateTemplateQuery,
  archiveTemplateQuery,
  createTemplateVersionQuery,
  getVersionByIdQuery,
} from "../utils/reportTemplate.utils";
import { REPORT_SECTION_CATALOG } from "../services/reporting/sectionCatalog";
import { NotFoundException } from "../domain.layer/exceptions/custom.exception";
import { runScheduledReport } from "../services/reporting/reportRunOrchestrator";

export async function listTemplates(req: Request, res: Response): Promise<any> {
  try {
    return res.status(200).json(STATUS_CODE[200](await getTemplatesQuery(req.organizationId!)));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function getTemplate(req: Request, res: Response): Promise<any> {
  try {
    const tpl = await getTemplateByIdQuery(Number(req.params.id), req.organizationId!);
    if (!tpl) return res.status(404).json(STATUS_CODE[404]("not found"));
    const version = await getLatestVersionQuery(tpl.id, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200]({ ...tpl, latestVersion: version }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function listSections(_req: Request, res: Response): Promise<any> {
  // Static catalog, no tenant data — no org scoping needed, but the route
  // still requires a valid JWT like every other reporting read.
  return res.status(200).json(STATUS_CODE[200](REPORT_SECTION_CATALOG));
}

const FILE_NAME = "reportTemplate.ctrl.ts";

// Config fields live on the version row, not the template row. Any of these in
// a PATCH body means "append a new version"; see the append-only note in
// reportTemplate.utils.ts.
const VERSION_CONFIG_FIELDS = [
  "sections_config",
  "ai_blocks_config",
  "format_config",
  "branding_config",
  "schedule_defaults",
  "delivery_defaults",
];

const hasVersionConfig = (body: any): boolean =>
  VERSION_CONFIG_FIELDS.some((f) => body?.[f] !== undefined);

// Maps CustomException subclasses to their status, mirroring
// customField.ctrl.ts. A Postgres unique violation (23505) becomes 409 —
// the slug index is the only unique constraint a caller can trip.
const respondWithError = (req: Request, res: Response, error: unknown): Response => {
  const pgErr = (error as any)?.parent ?? (error as any)?.original;
  if (pgErr?.code === "23505") {
    // Two different unique indexes can raise 23505 here. Do not report a
    // version-number race as a duplicate name — that sends the user off
    // renaming a template that was never the problem.
    const message =
      pgErr?.constraint === "idx_tpl_versions_unique"
        ? "this template was modified concurrently, please retry"
        : "a template with this name already exists";
    return res.status(409).json(STATUS_CODE[409](message));
  }
  const statusCode =
    error instanceof Error && "statusCode" in error
      ? (error as Error & { statusCode: number }).statusCode
      : 500;
  const statusFn = (STATUS_CODE as any)[statusCode];
  if (typeof statusFn === "function") {
    return res.status(statusCode).json(statusFn((error as Error).message));
  }
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
};

export async function createTemplate(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "createTemplate",
    functionName: "createTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    // Both INSERTs share one transaction. A template with no version is
    // unusable — the wizard reads latestVersion.sections_config and disables
    // its submit button without one — so a failure on the second write must
    // not leave the first committed as an undeletable-looking orphan in
    // GET /templates.
    const { tpl, version } = await sequelize.transaction(async (t) => {
      const tpl = await createTemplateQuery(req.body, req.organizationId!, req.userId!, t);
      const version = await createTemplateVersionQuery(
        tpl.id,
        req.organizationId!,
        req.body,
        req.userId!,
        t,
      );
      return { tpl, version };
    });
    await logSuccess({
      eventType: "Create",
      description: `Created report template ${tpl.id}`,
      functionName: "createTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201]({ ...tpl, latestVersion: version }));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "createTemplate failed",
      functionName: "createTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function updateTemplate(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  logProcessing({
    description: `updateTemplate ${id}`,
    functionName: "updateTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    // Same seven names as the `allowed` list in updateTemplateQuery — if these
    // drift apart, a PATCH for the missing field 400s as "no updatable fields".
    const metadataChanged = [
      "name",
      "description",
      "category",
      "default_scope",
      "supported_scopes",
      "recommended_frequency",
      "is_active",
    ].some((f) => req.body?.[f] !== undefined);

    const versionChanged = hasVersionConfig(req.body);
    if (!metadataChanged && !versionChanged) {
      return res.status(400).json(STATUS_CODE[400]("no updatable fields supplied"));
    }

    // A PATCH carrying both metadata and config is two writes; they share one
    // transaction so a failing version insert (e.g. the 23505 version race)
    // cannot leave the metadata update committed on its own. The 404s throw
    // rather than return so they roll back — NotFoundException already carries
    // statusCode 404, which respondWithError maps.
    const { tpl, version } = await sequelize.transaction(async (t) => {
      let tpl: any = null;
      if (metadataChanged) {
        tpl = await updateTemplateQuery(id, req.organizationId!, req.body, t);
        if (!tpl) throw new NotFoundException("not found", "report_template", id);
      }

      let version: any = null;
      if (versionChanged) {
        version = await createTemplateVersionQuery(id, req.organizationId!, req.body, req.userId!, t);
        // createTemplateVersionQuery returns undefined when its WHERE EXISTS
        // tenant guard matched nothing — treat that as a failed write, never
        // as a success with a null body.
        if (!version) throw new NotFoundException("not found", "report_template", id);
      }
      return { tpl, version };
    });

    await logSuccess({
      eventType: "Update",
      description: `Updated report template ${id}`,
      functionName: "updateTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ ...(tpl ?? { id }), latestVersion: version }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "updateTemplate failed",
      functionName: "updateTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

export async function archiveTemplate(req: Request, res: Response): Promise<any> {
  const id = Number(req.params.id);
  logProcessing({
    description: `archiveTemplate ${id}`,
    functionName: "archiveTemplate",
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const row = await archiveTemplateQuery(id, req.organizationId!);
    if (!row) return res.status(404).json(STATUS_CODE[404]("not found"));
    await logSuccess({
      eventType: "Delete",
      description: `Archived report template ${id}`,
      functionName: "archiveTemplate",
      fileName: FILE_NAME,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ ok: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "archiveTemplate failed",
      functionName: "archiveTemplate",
      fileName: FILE_NAME,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return respondWithError(req, res, error);
  }
}

/**
 * POST /reporting/templates/:id/run — produce one report from a template
 * without creating a schedule.
 *
 * Deliberately calls the same orchestrator a scheduled run uses, with a
 * schedule-shaped object whose id is null (report_runs.scheduled_report_id is
 * nullable). Generation, delivery, analysis and status handling therefore have
 * exactly one implementation.
 */
export async function runTemplateNow(req: Request, res: Response): Promise<any> {
  try {
    const templateId = Number(req.params.id);
    const organizationId = req.organizationId!;
    const userId = req.userId ?? null;

    const template = await getTemplateByIdQuery(templateId, organizationId);
    if (!template) return res.status(404).json(STATUS_CODE[404]("template not found"));

    const version = await getVersionByIdQuery(Number(req.body.templateVersionId), organizationId);
    if (!version || Number(version.template_id) !== templateId) {
      return res.status(404).json(STATUS_CODE[404]("template version not found"));
    }

    const isProjectScope = req.body.scope === "project";
    const sched = {
      id: null,
      organization_id: organizationId,
      template_id: templateId,
      template_version_id: version.id,
      name: req.body.name ?? template.name,
      project_id: isProjectScope ? (req.body.projectId ?? null) : null,
      framework_id: req.body.frameworkId ?? null,
      project_framework_id: req.body.projectFrameworkId ?? null,
      sections_config: req.body.sectionsConfig ?? null,
      ai_blocks_config: req.body.aiBlocksConfig ?? null,
      format: req.body.format ?? "pdf",
      // Storage is what gives the run a file_id, and a run without one has
      // nothing to download. Run now puts a report in the list; it is not a
      // delivery mechanism.
      delivery_config: { saveToStorage: true },
      owner_id: userId,
      created_by: userId,
      llm_key_id: template.llm_key_id ?? null,
    };

    await runScheduledReport(sched, { triggeredBy: "manual", userId: userId ?? undefined });

    return res.status(200).json(STATUS_CODE[200]({ started: true }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
