import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { uploadFile } from "../utils/fileUpload.utils";
import { RequestWithFile, UploadedFile } from "../utils/question.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import {
  getFrameworkDashboardQuery,
  getFrameworkTreeQuery,
  getImplByIdQuery,
  getImplContextQuery,
  getImplLinkedRisksQuery,
  ImplLevel,
  resolveLevel,
  updateImplQuery,
} from "../utils/frameworkImpl.utils";
import { getConfigById } from "../utils/frameworkRegistry.utils";

/**
 * Generic impl endpoints for the 21 migrated frameworks. All URL params are
 * validated (frameworkId + level + id) before dispatch; table names come
 * from Servers/structures/ via frameworkRegistry.utils.ts. Built-ins
 * (EU / ISO 42001 / ISO 27001 / NIST) keep their bespoke controllers.
 */

const LEVELS: ReadonlySet<ImplLevel> = new Set(["l2", "l3"]);

function parseLevel(raw: string): ImplLevel | null {
  return LEVELS.has(raw as ImplLevel) ? (raw as ImplLevel) : null;
}

function parseIntParam(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const num = parseInt(String(raw), 10);
  return Number.isFinite(num) ? num : null;
}

export async function getImplById(req: Request, res: Response): Promise<any> {
  const frameworkId = parseIntParam(req.params.frameworkId);
  const level = parseLevel(String(req.params.level));
  const id = parseIntParam(req.params.id);

  logger.debug(
    `[fw] getImplById framework=${frameworkId} level=${level} id=${id} org=${req.organizationId}`,
  );

  logProcessing({
    description: `starting getImplById framework=${frameworkId} level=${level} id=${id}`,
    functionName: "getImplById",
    fileName: "frameworkImpl.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (!frameworkId || !level || !id) {
      logger.debug(`[fw] getImplById → 400 invalid params`);
      return res.status(400).json(STATUS_CODE[400]("Invalid parameters"));
    }
    if (!resolveLevel(frameworkId, level)) {
      logger.debug(
        `[fw] getImplById → 404 framework not found (frameworkId=${frameworkId}, level=${level})`,
      );
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }

    const row = await getImplByIdQuery(frameworkId, level, id, req.organizationId!);
    if (!row) {
      logger.debug(`[fw] getImplById → 404 row not found`);
      return res.status(404).json(STATUS_CODE[404]("Record not found"));
    }
    logger.debug(
      `[fw] getImplById → 200 status=${(row as any).status} risks=${((row as any).risks || []).length}`,
    );

    await logSuccess({
      eventType: "Read",
      description: `Fetched impl row for framework=${frameworkId} level=${level} id=${id}`,
      functionName: "getImplById",
      fileName: "frameworkImpl.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to fetch impl row: ${(error as Error).message}`,
      functionName: "getImplById",
      fileName: "frameworkImpl.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getImplRisks(req: Request, res: Response): Promise<any> {
  const frameworkId = parseIntParam(req.params.frameworkId);
  const level = parseLevel(String(req.params.level));
  const id = parseIntParam(req.params.id);

  logger.debug(`[fw] getImplRisks framework=${frameworkId} level=${level} id=${id}`);

  logProcessing({
    description: `starting getImplRisks framework=${frameworkId} level=${level} id=${id}`,
    functionName: "getImplRisks",
    fileName: "frameworkImpl.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (!frameworkId || !level || !id) {
      logger.debug(`[fw] getImplRisks → 400 invalid params`);
      return res.status(400).json(STATUS_CODE[400]("Invalid parameters"));
    }
    if (!resolveLevel(frameworkId, level)) {
      logger.debug(`[fw] getImplRisks → 404 framework not resolvable`);
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }

    const risks = await getImplLinkedRisksQuery(frameworkId, level, id, req.organizationId!);
    logger.debug(`[fw] getImplRisks → 200 count=${risks?.length ?? 0}`);

    await logSuccess({
      eventType: "Read",
      description: `Fetched ${risks?.length ?? 0} risks for framework=${frameworkId} level=${level} id=${id}`,
      functionName: "getImplRisks",
      fileName: "frameworkImpl.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json({
      message: req.t!("Risks retrieved successfully"),
      data: risks ?? [],
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to fetch impl risks: ${(error as Error).message}`,
      functionName: "getImplRisks",
      fileName: "frameworkImpl.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateImpl(req: RequestWithFile, res: Response): Promise<any> {
  const frameworkId = parseIntParam(req.params.frameworkId);
  const level = parseLevel(String(req.params.level));
  const id = parseIntParam(req.params.id);

  logProcessing({
    description: `starting updateImpl framework=${frameworkId} level=${level} id=${id}`,
    functionName: "updateImpl",
    fileName: "frameworkImpl.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  const fileCount = Array.isArray(req.files) ? req.files.length : 0;
  logger.debug(
    `[fw] updateImpl framework=${frameworkId} level=${level} id=${id} files=${fileCount} bodyKeys=${Object.keys(req.body || {}).join(",")}`,
  );

  const transaction = await sequelize.transaction();
  try {
    if (!frameworkId || !level || !id) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid parameters"));
    }
    const resolved = resolveLevel(frameworkId, level);
    if (!resolved) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }
    const uploadLabel = resolved.cfg.source_labels[resolved.tables.entityType];
    if (!uploadLabel) {
      await transaction.rollback();
      throw new Error(
        `Missing source_labels['${resolved.tables.entityType}'] for framework ${resolved.cfg.key}`,
      );
    }

    const context = await getImplContextQuery(
      frameworkId,
      level,
      id,
      req.organizationId!,
      transaction,
    );
    if (!context) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Record not found"));
    }

    const body = req.body as Record<string, string> & { user_id?: string };

    const deletedRaw = JSON.parse(body.delete || "[]");
    const deletedFileIds = Array.isArray(deletedRaw)
      ? deletedRaw
          .map((v: string | number) => (typeof v === "string" ? parseInt(v) : v))
          .filter((v: number) => Number.isFinite(v))
      : [];

    const uploaderId = body.user_id ? parseInt(body.user_id) : req.userId!;
    const uploadedFileIds: number[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files as UploadedFile[]) {
        const uploaded = await uploadFile(
          file,
          uploaderId,
          context.project_id,
          uploadLabel,
          req.organizationId!,
          transaction,
        );
        if (uploaded?.id !== undefined) uploadedFileIds.push(uploaded.id);
      }
    }

    logger.debug(
      `[fw] updateImpl → uploaded=${uploadedFileIds.length} deleted=${deletedFileIds.length} risksMitigated=${body.risksMitigated || "[]"} risksDelete=${body.risksDelete || "[]"}`,
    );

    const updated = await updateImplQuery(
      frameworkId,
      level,
      id,
      req.organizationId!,
      {
        status: body.status,
        implementation_description: body.implementation_description,
        owner: body.owner,
        reviewer: body.reviewer,
        approver: body.approver,
        due_date: body.due_date,
        auditor_feedback: body.auditor_feedback,
        risksMitigated: body.risksMitigated,
        risksDelete: body.risksDelete,
      },
      uploadedFileIds,
      deletedFileIds,
      transaction,
    );
    logger.debug(
      `[fw] updateImpl → updated status=${(updated as any)?.status} risks=${((updated as any)?.risks || []).length}`,
    );

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Saved impl row framework=${frameworkId} level=${level} id=${id}`,
      functionName: "updateImpl",
      fileName: "frameworkImpl.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to save impl row: ${(error as Error).message}`,
      functionName: "updateImpl",
      fileName: "frameworkImpl.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getFrameworkTree(req: Request, res: Response): Promise<any> {
  const frameworkId = parseIntParam(req.params.frameworkId);
  const projectId = parseIntParam(req.params.projectId);

  logger.debug(
    `[fw] getFrameworkTree framework=${frameworkId} project=${projectId} org=${req.organizationId}`,
  );

  logProcessing({
    description: `starting getFrameworkTree framework=${frameworkId} project=${projectId}`,
    functionName: "getFrameworkTree",
    fileName: "frameworkImpl.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (!frameworkId || !projectId) {
      logger.debug(`[fw] getFrameworkTree → 400 invalid params`);
      return res.status(400).json(STATUS_CODE[400]("Invalid parameters"));
    }

    const pfRow = (await sequelize.query(
      `SELECT id FROM projects_frameworks
        WHERE organization_id = :organizationId
          AND project_id = :projectId
          AND framework_id = :frameworkId
        LIMIT 1;`,
      {
        replacements: {
          organizationId: req.organizationId!,
          projectId,
          frameworkId,
        },
      },
    )) as [Array<{ id: number }>, unknown];

    const projectFrameworkId = pfRow[0]?.[0]?.id;
    if (!projectFrameworkId) {
      logger.debug(`[fw] getFrameworkTree → 404 framework not attached to project`);
      return res.status(404).json(STATUS_CODE[404]("Framework not attached to this project"));
    }

    const cfg = getConfigById(frameworkId);
    if (!cfg) {
      logger.debug(`[fw] getFrameworkTree → 404 no structure for frameworkId=${frameworkId}`);
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }
    logger.debug(
      `[fw] getFrameworkTree resolved: key=${cfg.key} type=${cfg.framework_type} pfId=${projectFrameworkId}`,
    );

    const tree = await getFrameworkTreeQuery(frameworkId, projectFrameworkId, req.organizationId!);
    if (!tree) {
      logger.debug(`[fw] getFrameworkTree → 404 tree query returned null`);
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }
    const totalL2 = tree.reduce((sum, l1) => sum + ((l1 as any).children?.length || 0), 0);
    const totalL3 = tree.reduce(
      (sum, l1) =>
        sum +
        ((l1 as any).children || []).reduce(
          (s2: number, l2: any) => s2 + (l2.children?.length || 0),
          0,
        ),
      0,
    );
    logger.debug(`[fw] getFrameworkTree → 200 L1=${tree.length} L2=${totalL2} L3=${totalL3}`);

    await logSuccess({
      eventType: "Read",
      description: `Fetched tree for framework=${frameworkId} project=${projectId}`,
      functionName: "getFrameworkTree",
      fileName: "frameworkImpl.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(
      STATUS_CODE[200]({
        projects_frameworks_id: projectFrameworkId,
        framework: {
          id: cfg.id,
          key: cfg.key,
          framework_type: cfg.framework_type,
          display_name: cfg.displayName,
          entity_types: cfg.entity_types,
          hierarchy_type: cfg.tables.l3_struct ? "three_level" : "two_level",
        },
        tree,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to fetch framework tree: ${(error as Error).message}`,
      functionName: "getFrameworkTree",
      fileName: "frameworkImpl.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Aggregate progress + assignments + status breakdown for one generic
 * framework, scoped to a projects_frameworks row. Consumed by the org
 * Framework Dashboard cards (Framework progress / Assignment status /
 * Status breakdown).
 */
export async function getFrameworkDashboard(req: Request, res: Response): Promise<any> {
  const frameworkId = parseIntParam(req.params.frameworkId);
  const projectFrameworkId = parseIntParam(req.params.projectFrameworkId);

  logger.debug(
    `[fw] getFrameworkDashboard framework=${frameworkId} pfId=${projectFrameworkId} org=${req.organizationId}`,
  );

  logProcessing({
    description: `starting getFrameworkDashboard framework=${frameworkId} pfId=${projectFrameworkId}`,
    functionName: "getFrameworkDashboard",
    fileName: "frameworkImpl.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    if (!frameworkId || !projectFrameworkId) {
      return res.status(400).json(STATUS_CODE[400]("Invalid parameters"));
    }

    const pfRow = (await sequelize.query(
      `SELECT id FROM projects_frameworks
        WHERE organization_id = :organizationId
          AND id = :projectFrameworkId
          AND framework_id = :frameworkId
        LIMIT 1;`,
      {
        replacements: {
          organizationId: req.organizationId!,
          projectFrameworkId,
          frameworkId,
        },
      },
    )) as [Array<{ id: number }>, unknown];

    if (!pfRow[0]?.[0]?.id) {
      return res.status(404).json(STATUS_CODE[404]("Framework not attached to this project"));
    }

    const counts = await getFrameworkDashboardQuery(
      frameworkId,
      projectFrameworkId,
      req.organizationId!,
    );
    if (!counts) {
      return res.status(404).json(STATUS_CODE[404]("Framework not found"));
    }

    await logSuccess({
      eventType: "Read",
      description: `Fetched dashboard counts for framework=${frameworkId} pfId=${projectFrameworkId}`,
      functionName: "getFrameworkDashboard",
      fileName: "frameworkImpl.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](counts));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to fetch framework dashboard: ${(error as Error).message}`,
      functionName: "getFrameworkDashboard",
      fileName: "frameworkImpl.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
