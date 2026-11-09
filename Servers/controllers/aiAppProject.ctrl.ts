import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { AI_APP_NAME_CONSTRAINT } from "../utils/aiApp.utils";
import {
  createAiAppFromProjectQuery,
  getAiAppUseCasesQuery,
  getCreateAiAppPreviewQuery,
  getProjectAiAppsQuery,
  getVisibleProjectQuery,
  linkUseCaseToAiAppQuery,
  ProjectViewer,
  unlinkUseCaseFromAiAppQuery,
} from "../utils/aiAppProject.utils";
import { translateError } from "../utils/i18n.utils";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { toId } from "../utils/validations/validation.utils";

const FILE_NAME = "aiAppProject.ctrl.ts";
const AI_APP_NAME_MAX_LENGTH = 255;
/** Largest value of a Postgres INTEGER id; anything above it cannot match a row. */
const MAX_ID = 2147483647;

type EventType = "Create" | "Read" | "Update" | "Delete";

function positiveId(value: unknown): number | null {
  const id = toId(value);
  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}

function viewerOf(req: Request): ProjectViewer {
  return { userId: req.userId!, role: req.role! };
}

function context(req: Request, functionName: string) {
  return {
    functionName,
    fileName: FILE_NAME,
    userId: req.userId!,
    organizationId: req.organizationId!,
  };
}

async function failed(
  req: Request,
  res: Response,
  functionName: string,
  eventType: EventType,
  description: string,
  error: unknown,
): Promise<any> {
  await logFailure({
    ...context(req, functionName),
    eventType,
    description,
    error: error as Error,
  });
  return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
}

/** Trimmed body.name; undefined means "use the title"; null means it cannot be used. */
function requestedAiAppName(body: unknown): string | undefined | null {
  const raw = (body as { name?: unknown } | undefined)?.name;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length > AI_APP_NAME_MAX_LENGTH) return null;
  return trimmed || undefined;
}

/** POST /api/v1/projects/:id/create-ai-app (#5259). */
export async function createAiAppFromUseCase(req: Request, res: Response): Promise<any> {
  const functionName = "createAiAppFromUseCase";
  const projectId = positiveId(req.params.id);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid use case ID")));
  }
  const name = requestedAiAppName(req.body);
  if (name === null) {
    return res
      .status(400)
      .json(STATUS_CODE[400](req.t!("AI app name must be text of at most 255 characters")));
  }

  logProcessing({
    ...context(req, functionName),
    description: `starting ${functionName} for use case ${projectId}`,
  });

  const transaction = await sequelize.transaction();
  try {
    const aiApp = await createAiAppFromProjectQuery(
      projectId,
      name,
      viewerOf(req),
      req.organizationId!,
      transaction,
    );
    if (!aiApp) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Project not found")));
    }
    await transaction.commit();

    await logSuccess({
      ...context(req, functionName),
      eventType: "Create",
      description: `Created AI app ${aiApp.id} from use case ${projectId}`,
    });
    return res.status(201).json(STATUS_CODE[201](aiApp));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    // Only the per-org name constraint means the name is taken.
    const pg = (error as { parent?: { code?: string; constraint?: string } })?.parent;
    if (pg?.code === "23505" && pg.constraint === AI_APP_NAME_CONSTRAINT) {
      return res
        .status(409)
        .json(STATUS_CODE[409](req.t!("An AI app with this name already exists")));
    }
    return failed(req, res, functionName, "Create", "Failed to create AI app from use case", error);
  }
}

/** GET /api/v1/projects/:id/create-ai-app: what the create would copy (#5259). */
export async function getCreateAiAppPreview(req: Request, res: Response): Promise<any> {
  const functionName = "getCreateAiAppPreview";
  const projectId = positiveId(req.params.id);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid use case ID")));
  }

  logProcessing({
    ...context(req, functionName),
    description: `starting ${functionName} for use case ${projectId}`,
  });

  try {
    const preview = await getCreateAiAppPreviewQuery(projectId, viewerOf(req), req.organizationId!);
    if (!preview) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Project not found")));
    }

    await logSuccess({
      ...context(req, functionName),
      eventType: "Read",
      description: `Previewed AI app creation from use case ${projectId}`,
    });
    return res.status(200).json(STATUS_CODE[200](preview));
  } catch (error) {
    return failed(req, res, functionName, "Read", "Failed to preview AI app creation", error);
  }
}

/** GET /api/v1/projects/:id/ai-apps (#5259). */
export async function listUseCaseAiApps(req: Request, res: Response): Promise<any> {
  const functionName = "listUseCaseAiApps";
  const projectId = positiveId(req.params.id);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid use case ID")));
  }

  logProcessing({
    ...context(req, functionName),
    description: `starting ${functionName} for use case ${projectId}`,
  });

  try {
    const project = await getVisibleProjectQuery(projectId, viewerOf(req), req.organizationId!);
    if (!project) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Project not found")));
    }
    const aiApps = await getProjectAiAppsQuery(projectId, req.organizationId!);

    await logSuccess({
      ...context(req, functionName),
      eventType: "Read",
      description: `Retrieved ${aiApps.length} AI apps linked to use case ${projectId}`,
    });
    return res.status(200).json(STATUS_CODE[200](aiApps));
  } catch (error) {
    return failed(req, res, functionName, "Read", "Failed to list linked AI apps", error);
  }
}

/** GET /api/v1/ai-apps/:id/use-cases (#5259). */
export async function listAiAppUseCases(req: Request, res: Response): Promise<any> {
  const functionName = "listAiAppUseCases";
  const aiAppId = positiveId(req.params.id);
  if (aiAppId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid AI app ID")));
  }

  logProcessing({
    ...context(req, functionName),
    description: `starting ${functionName} for AI app ${aiAppId}`,
  });

  try {
    const result = await getAiAppUseCasesQuery(aiAppId, viewerOf(req), req.organizationId!);
    if (!result) {
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await logSuccess({
      ...context(req, functionName),
      eventType: "Read",
      description: `Retrieved ${result.use_cases.length} use cases linked to AI app ${aiAppId}`,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    return failed(req, res, functionName, "Read", "Failed to list linked use cases", error);
  }
}

/** POST /api/v1/ai-apps/:id/use-cases (#5259). */
export async function linkAiAppUseCase(req: Request, res: Response): Promise<any> {
  const functionName = "linkAiAppUseCase";
  const aiAppId = positiveId(req.params.id);
  if (aiAppId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid AI app ID")));
  }
  const projectId = positiveId(req.body?.project_id);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid use case ID")));
  }

  logProcessing({
    ...context(req, functionName),
    description: `starting ${functionName} for AI app ${aiAppId}, use case ${projectId}`,
  });

  const transaction = await sequelize.transaction();
  try {
    const linked = await linkUseCaseToAiAppQuery(
      aiAppId,
      projectId,
      viewerOf(req),
      req.organizationId!,
      transaction,
    );
    if (!linked) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app or use case not found")));
    }
    await transaction.commit();

    await logSuccess({
      ...context(req, functionName),
      eventType: "Update",
      description: `Linked use case ${projectId} to AI app ${aiAppId}`,
    });
    return res.status(201).json(STATUS_CODE[201]({ ai_app_id: aiAppId, project_id: projectId }));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    return failed(req, res, functionName, "Update", "Failed to link use case to AI app", error);
  }
}

/** DELETE /api/v1/ai-apps/:id/use-cases/:projectId (#5259). */
export async function unlinkAiAppUseCase(req: Request, res: Response): Promise<any> {
  const functionName = "unlinkAiAppUseCase";
  const aiAppId = positiveId(req.params.id);
  if (aiAppId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid AI app ID")));
  }
  const projectId = positiveId(req.params.projectId);
  if (projectId === null) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid use case ID")));
  }

  logProcessing({
    ...context(req, functionName),
    description: `starting ${functionName} for AI app ${aiAppId}, use case ${projectId}`,
  });

  const transaction = await sequelize.transaction();
  try {
    const removed = await unlinkUseCaseFromAiAppQuery(
      aiAppId,
      projectId,
      viewerOf(req),
      req.organizationId!,
      transaction,
    );
    if (!removed) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("Link not found")));
    }
    await transaction.commit();

    await logSuccess({
      ...context(req, functionName),
      eventType: "Delete",
      description: `Unlinked use case ${projectId} from AI app ${aiAppId}`,
    });
    return res.status(200).json(STATUS_CODE[200]({ ai_app_id: aiAppId, project_id: projectId }));
  } catch (error) {
    await transaction.rollback();
    return failed(req, res, functionName, "Delete", "Failed to unlink use case from AI app", error);
  }
}
