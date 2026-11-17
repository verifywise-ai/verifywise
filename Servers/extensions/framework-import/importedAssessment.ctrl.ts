import { Request, Response } from "express";
import { sequelize } from "../../database/db";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import { translateError } from "../../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../../utils/logger/logHelper";
import { CustomException } from "../../domain.layer/exceptions/custom.exception";
import { uploadFile } from "../../utils/fileUpload.utils";
import { RequestWithFile, UploadedFile } from "../../utils/question.utils";
import { hasPendingApprovalQuery } from "../../utils/approvalRequest.utils";
import { getProjectAccessQuery, getProjectReadAccessQuery } from "../../utils/project.utils";
import { parseFrameworkId as parseRouteId } from "./frameworkImport.ctrl";
import {
  attachImportedFrameworkQuery,
  detachImportedFrameworkQuery,
  getImplLinkedRisksQuery,
  getImplQuery,
  getLinkContextQuery,
  getLinkDashboardQuery,
  getLinkTreeQuery,
  getProjectForLinkQuery,
  implBelongsToLinkQuery,
  IMPORTED_SOURCE_LABEL,
  ImportedImplLevel,
  LinkContext,
  listProjectLinksQuery,
  parseIdList,
  parseLevel,
  replaceImplRisksQuery,
  toPositiveId,
  updateImplQuery,
} from "./importedAssessment.service";

/**
 * Imported framework assessment on use cases (#5254), served at
 * /api/v1/imported-framework-assessments. Project-scoped routes check use case
 * access in the router (requireProjectAccess); link-scoped routes resolve the
 * link in the caller's organization first (404), then check access to its use
 * case (403) here.
 */

const fileName = "importedAssessment.ctrl.ts";

type EventType = "Create" | "Read" | "Update" | "Delete";

function ctx(req: Request) {
  return { userId: req.userId!, organizationId: req.organizationId! };
}

async function fail(
  req: Request,
  res: Response,
  error: unknown,
  eventType: EventType,
  functionName: string,
  description: string,
): Promise<Response> {
  const status = error instanceof CustomException ? error.statusCode : 500;
  if (status >= 500) {
    await logFailure({
      eventType,
      description,
      functionName,
      fileName,
      error: error as Error,
      ...ctx(req),
    });
  }
  const body = (STATUS_CODE as any)[status] ?? STATUS_CODE[500];
  return res.status(status).json(body(translateError(req, error)));
}

function badRequest(req: Request, res: Response, message: string): Response {
  return res.status(400).json(STATUS_CODE[400](req.t!(message)));
}

/** 403 when the use case has a pending approval request (same rule as bundled frameworks). */
async function rejectIfPendingApproval(
  req: Request,
  res: Response,
  projectId: number,
): Promise<boolean> {
  const pending = await hasPendingApprovalQuery(projectId, "use_case", req.organizationId!);
  if (!pending) return false;
  res
    .status(403)
    .json(
      STATUS_CODE[403](
        req.t!(
          "This use case has a pending approval request and cannot be modified until the approval process is complete.",
        ),
      ),
    );
  return true;
}

/**
 * Resolve the link named by :linkId in the caller's organization and check
 * the caller can see its use case (read access for GET, write access
 * otherwise). Answers 400 / 404 / 403 itself and returns null then.
 */
async function loadLink(req: Request, res: Response): Promise<LinkContext | null> {
  const linkId = parseRouteId(req.params.linkId);
  if (linkId === null) {
    badRequest(req, res, "Invalid link id");
    return null;
  }
  const link = await getLinkContextQuery(linkId, req.organizationId!);
  if (!link) {
    res.status(404).json(STATUS_CODE[404](req.t!("Framework not attached to this use case")));
    return null;
  }
  const viewer = { userId: req.userId!, role: req.role ?? "" };
  const accessQuery = req.method === "GET" ? getProjectReadAccessQuery : getProjectAccessQuery;
  const access = await accessQuery(link.project_id, viewer, req.organizationId!);
  if (access === "not_found") {
    res.status(404).json(STATUS_CODE[404](req.t!("Framework not attached to this use case")));
    return null;
  }
  if (access === "denied") {
    res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
    return null;
  }
  return link;
}

/** :level and :implId of an impl route; answers 400 itself and returns null on bad input. */
function parseImplParams(
  req: Request,
  res: Response,
): { level: ImportedImplLevel; implId: number } | null {
  const level = parseLevel(req.params.level);
  const implId = parseRouteId(req.params.implId);
  if (!level || implId === null) {
    badRequest(req, res, "Invalid parameters");
    return null;
  }
  return { level, implId };
}

// ---------------------------------------------------------------------------
// PROJECT LINKS
// ---------------------------------------------------------------------------

export async function listProjectLinks(req: Request, res: Response): Promise<any> {
  const projectId = parseRouteId(req.params.projectId);
  logProcessing({
    description: `starting listProjectLinks project=${projectId}`,
    functionName: "listProjectLinks",
    fileName,
    ...ctx(req),
  });
  try {
    if (projectId === null) return badRequest(req, res, "Invalid project ID");
    if (!(await getProjectForLinkQuery(projectId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Use case not found")));
    }
    const links = await listProjectLinksQuery(projectId, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](links));
  } catch (error) {
    return fail(req, res, error, "Read", "listProjectLinks", "failed to list imported frameworks");
  }
}

export async function attachToProject(req: Request, res: Response): Promise<any> {
  const projectId = parseRouteId(req.params.projectId);
  logProcessing({
    description: `starting attachToProject project=${projectId}`,
    functionName: "attachToProject",
    fileName,
    ...ctx(req),
  });
  try {
    if (projectId === null) return badRequest(req, res, "Invalid project ID");
    const importedFrameworkId = toPositiveId(req.body?.imported_framework_id);
    if (importedFrameworkId === null) {
      return badRequest(req, res, "Invalid imported framework id");
    }
    if (await rejectIfPendingApproval(req, res, projectId)) return;

    const link = await attachImportedFrameworkQuery(
      projectId,
      importedFrameworkId,
      req.organizationId!,
    );
    await logSuccess({
      eventType: "Create",
      description: `added imported framework ${importedFrameworkId} to use case ${projectId} (link ${link.id})`,
      functionName: "attachToProject",
      fileName,
      ...ctx(req),
    });
    return res.status(201).json(STATUS_CODE[201](link));
  } catch (error) {
    return fail(req, res, error, "Create", "attachToProject", "failed to add imported framework");
  }
}

export async function detachFromProject(req: Request, res: Response): Promise<any> {
  const projectId = parseRouteId(req.params.projectId);
  const linkId = parseRouteId(req.params.linkId);
  logProcessing({
    description: `starting detachFromProject project=${projectId} link=${linkId}`,
    functionName: "detachFromProject",
    fileName,
    ...ctx(req),
  });
  try {
    if (projectId === null) return badRequest(req, res, "Invalid project ID");
    if (linkId === null) return badRequest(req, res, "Invalid link id");
    if (await rejectIfPendingApproval(req, res, projectId)) return;

    await detachImportedFrameworkQuery(projectId, linkId, req.organizationId!);
    await logSuccess({
      eventType: "Delete",
      description: `removed imported framework link ${linkId} from use case ${projectId}`,
      functionName: "detachFromProject",
      fileName,
      ...ctx(req),
    });
    return res.status(200).json(STATUS_CODE[200]({ id: linkId }));
  } catch (error) {
    return fail(
      req,
      res,
      error,
      "Delete",
      "detachFromProject",
      "failed to remove imported framework",
    );
  }
}

// ---------------------------------------------------------------------------
// TREE + DASHBOARD
// ---------------------------------------------------------------------------

export async function getLinkTree(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: `starting getLinkTree link=${req.params.linkId}`,
    functionName: "getLinkTree",
    fileName,
    ...ctx(req),
  });
  try {
    const link = await loadLink(req, res);
    if (!link) return;
    const tree = await getLinkTreeQuery(link, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](tree));
  } catch (error) {
    return fail(req, res, error, "Read", "getLinkTree", "failed to load imported framework tree");
  }
}

export async function getLinkDashboard(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: `starting getLinkDashboard link=${req.params.linkId}`,
    functionName: "getLinkDashboard",
    fileName,
    ...ctx(req),
  });
  try {
    const link = await loadLink(req, res);
    if (!link) return;
    const counts = await getLinkDashboardQuery(link, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](counts));
  } catch (error) {
    return fail(
      req,
      res,
      error,
      "Read",
      "getLinkDashboard",
      "failed to load imported framework dashboard",
    );
  }
}

// ---------------------------------------------------------------------------
// IMPL ROWS
// ---------------------------------------------------------------------------

export async function getImpl(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: `starting getImpl link=${req.params.linkId} level=${req.params.level} id=${req.params.implId}`,
    functionName: "getImpl",
    fileName,
    ...ctx(req),
  });
  try {
    const params = parseImplParams(req, res);
    if (!params) return;
    const link = await loadLink(req, res);
    if (!link) return;
    const row = await getImplQuery(link.id, params.level, params.implId, req.organizationId!);
    if (!row) return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    return fail(req, res, error, "Read", "getImpl", "failed to load imported framework item");
  }
}

export async function getImplRisks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: `starting getImplRisks link=${req.params.linkId} level=${req.params.level} id=${req.params.implId}`,
    functionName: "getImplRisks",
    fileName,
    ...ctx(req),
  });
  try {
    const params = parseImplParams(req, res);
    if (!params) return;
    const link = await loadLink(req, res);
    if (!link) return;
    const { level, implId } = params;
    if (!(await implBelongsToLinkQuery(link.id, level, implId, req.organizationId!))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
    }
    const risks = await getImplLinkedRisksQuery(level, implId, req.organizationId!);
    return res.status(200).json({
      message: req.t!("Risks retrieved successfully"),
      data: risks,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
  } catch (error) {
    return fail(req, res, error, "Read", "getImplRisks", "failed to load imported framework risks");
  }
}

export async function updateImpl(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: `starting updateImpl link=${req.params.linkId} level=${req.params.level} id=${req.params.implId}`,
    functionName: "updateImpl",
    fileName,
    ...ctx(req),
  });
  const params = parseImplParams(req, res);
  if (!params) return;
  const { level, implId } = params;

  let link: LinkContext | null;
  try {
    link = await loadLink(req, res);
  } catch (error) {
    return fail(req, res, error, "Update", "updateImpl", "failed to save imported framework item");
  }
  if (!link) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const transaction = await sequelize.transaction();
  try {
    if (!(await implBelongsToLinkQuery(link.id, level, implId, req.organizationId!, transaction))) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
    }

    const deletedFileIds = parseIdList(body.delete, "delete");
    const uploadedFileIds: number[] = [];
    const files = (req as unknown as RequestWithFile).files;
    if (Array.isArray(files)) {
      for (const file of files as UploadedFile[]) {
        // The uploader is the caller; a user_id in the body is ignored.
        const uploaded = await uploadFile(
          file,
          req.userId!,
          link.project_id,
          IMPORTED_SOURCE_LABEL,
          req.organizationId!,
          transaction,
        );
        if (uploaded?.id !== undefined) uploadedFileIds.push(uploaded.id);
      }
    }

    const updated = await updateImplQuery(
      link,
      level,
      implId,
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
    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `saved imported framework item link=${link.id} level=${level} id=${implId}`,
      functionName: "updateImpl",
      fileName,
      ...ctx(req),
    });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // already finished
    }
    return fail(req, res, error, "Update", "updateImpl", "failed to save imported framework item");
  }
}

export async function replaceImplRisks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: `starting replaceImplRisks link=${req.params.linkId} level=${req.params.level} id=${req.params.implId}`,
    functionName: "replaceImplRisks",
    fileName,
    ...ctx(req),
  });
  const params = parseImplParams(req, res);
  if (!params) return;
  const { level, implId } = params;
  if (!Array.isArray(req.body?.risk_ids)) {
    return badRequest(req, res, "risk_ids must be a list of ids");
  }

  let link: LinkContext | null;
  let riskIds: number[];
  try {
    riskIds = parseIdList(req.body.risk_ids, "risk_ids");
    link = await loadLink(req, res);
  } catch (error) {
    return fail(req, res, error, "Update", "replaceImplRisks", "failed to link risks");
  }
  if (!link) return;

  const transaction = await sequelize.transaction();
  try {
    if (!(await implBelongsToLinkQuery(link.id, level, implId, req.organizationId!, transaction))) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Record not found")));
    }
    const risks = await replaceImplRisksQuery(
      link,
      level,
      implId,
      req.organizationId!,
      riskIds,
      transaction,
    );
    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `linked ${riskIds.length} risks to imported framework item link=${link.id} level=${level} id=${implId}`,
      functionName: "replaceImplRisks",
      fileName,
      ...ctx(req),
    });
    return res.status(200).json(STATUS_CODE[200](risks));
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // already finished
    }
    return fail(req, res, error, "Update", "replaceImplRisks", "failed to link risks");
  }
}
