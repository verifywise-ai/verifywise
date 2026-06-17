import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { translateError } from "../utils/i18n.utils";
import {
  createAiAppQuery,
  deleteAiAppByIdQuery,
  getAiAppByIdQuery,
  getAllAiAppsQuery,
  getPolicySuggestionsQuery,
  linkModelsToAiAppQuery,
  promoteFromShadowAiQuery,
  setDataExposureForAiAppQuery,
  setPoliciesForAiAppQuery,
  updateAiAppByIdQuery,
} from "../utils/aiApp.utils";
import { AiAppStatus, AiAppPolicyStatus } from "../domain.layer/enums/ai-app-status.enum";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

function parseIdParam(req: Request): number {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ValidationException("Valid ID is required", "id", raw);
  }
  return parsed;
}

function parseShadowAiToolIdParam(req: Request): number {
  const raw = Array.isArray(req.params.shadowAiToolId)
    ? req.params.shadowAiToolId[0]
    : req.params.shadowAiToolId;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ValidationException("Valid Shadow AI tool ID is required", "shadowAiToolId", raw);
  }
  return parsed;
}

export async function getAllAiApps(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllAiApps",
    functionName: "getAllAiApps",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const status = req.query.status as AiAppStatus | undefined;
    const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string, 10) : undefined;
    const parsedPage = req.query.page ? parseInt(req.query.page as string, 10) : NaN;
    const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : NaN;
    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? undefined : parsedPage;
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? undefined : parsedLimit;
    const sortBy = req.query.sortBy as string | undefined;
    const order = req.query.order as "asc" | "desc" | undefined;

    const result = await getAllAiAppsQuery(req.organizationId!, {
      status,
      vendorId,
      page,
      limit,
      sortBy,
      order,
    });

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${result.ai_apps.length} AI Apps`,
      functionName: "getAllAiApps",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve AI Apps",
      functionName: "getAllAiApps",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getAiAppById(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting getAiAppById for ID ${aiAppId}`,
    functionName: "getAiAppById",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const aiApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);

    if (!aiApp) {
      await logSuccess({
        eventType: "Read",
        description: `AI App not found: ID ${aiAppId}`,
        functionName: "getAiAppById",
        fileName: "aiApp.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await logSuccess({
      eventType: "Read",
      description: `Retrieved AI App ID ${aiAppId}`,
      functionName: "getAiAppById",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aiApp));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve AI App by ID",
      functionName: "getAiAppById",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function createAiApp(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createAiApp",
    functionName: "createAiApp",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const aiApp = await createAiAppQuery(req.body, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `Created AI App ID ${aiApp.id}`,
      functionName: "createAiApp",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "Failed to create AI App",
      functionName: "createAiApp",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateAiAppById(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting updateAiAppById for ID ${aiAppId}`,
    functionName: "updateAiAppById",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const aiApp = await updateAiAppByIdQuery(aiAppId, req.body, req.organizationId!, transaction);

    if (!aiApp) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Updated AI App ID ${aiAppId}`,
      functionName: "updateAiAppById",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to update AI App",
      functionName: "updateAiAppById",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function updateAiAppStatus(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting updateAiAppStatus for ID ${aiAppId}`,
    functionName: "updateAiAppStatus",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const { status } = req.body;
    if (!status || !Object.values(AiAppStatus).includes(status)) {
      throw new ValidationException("Invalid status value", "status", status);
    }

    const aiApp = await updateAiAppByIdQuery(aiAppId, { status }, req.organizationId!, transaction);

    if (!aiApp) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Updated AI App ID ${aiAppId} status to ${status}`,
      functionName: "updateAiAppStatus",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to update AI App status",
      functionName: "updateAiAppStatus",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteAiAppById(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting deleteAiAppById for ID ${aiAppId}`,
    functionName: "deleteAiAppById",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const deleted = await deleteAiAppByIdQuery(aiAppId, req.organizationId!, transaction);

    if (!deleted) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await transaction.commit();

    await logSuccess({
      eventType: "Delete",
      description: `Deleted AI App ID ${aiAppId}`,
      functionName: "deleteAiAppById",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200]({ id: aiAppId }));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: "Failed to delete AI App",
      functionName: "deleteAiAppById",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function linkModelsToAiApp(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting linkModelsToAiApp for ID ${aiAppId}`,
    functionName: "linkModelsToAiApp",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const { model_inventory_ids } = req.body;
    if (!Array.isArray(model_inventory_ids)) {
      throw new ValidationException(
        "model_inventory_ids must be an array",
        "model_inventory_ids",
        model_inventory_ids,
      );
    }

    const existingApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);
    if (!existingApp) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await linkModelsToAiAppQuery(aiAppId, model_inventory_ids, req.organizationId!, transaction);
    await transaction.commit();

    const aiApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);

    await logSuccess({
      eventType: "Update",
      description: `Linked models to AI App ID ${aiAppId}`,
      functionName: "linkModelsToAiApp",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to link models to AI App",
      functionName: "linkModelsToAiApp",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function setPoliciesForAiApp(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting setPoliciesForAiApp for ID ${aiAppId}`,
    functionName: "setPoliciesForAiApp",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const { policies } = req.body;
    if (!Array.isArray(policies)) {
      throw new ValidationException("policies must be an array", "policies", policies);
    }

    const existingApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);
    if (!existingApp) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await setPoliciesForAiAppQuery(
      aiAppId,
      policies.map((p: any) => ({
        policy_id: p.policy_id,
        status: p.status || AiAppPolicyStatus.APPLICABLE,
      })),
      req.organizationId!,
      transaction,
    );
    await transaction.commit();

    const aiApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);

    await logSuccess({
      eventType: "Update",
      description: `Set policies for AI App ID ${aiAppId}`,
      functionName: "setPoliciesForAiApp",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to set policies for AI App",
      functionName: "setPoliciesForAiApp",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function setDataExposureForAiApp(req: Request, res: Response): Promise<any> {
  const aiAppId = parseIdParam(req);

  logProcessing({
    description: `starting setDataExposureForAiApp for ID ${aiAppId}`,
    functionName: "setDataExposureForAiApp",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const { data_exposure } = req.body;
    if (!Array.isArray(data_exposure)) {
      throw new ValidationException(
        "data_exposure must be an array",
        "data_exposure",
        data_exposure,
      );
    }

    const existingApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);
    if (!existingApp) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("AI app not found")));
    }

    await setDataExposureForAiAppQuery(aiAppId, data_exposure, transaction);
    await transaction.commit();

    const aiApp = await getAiAppByIdQuery(aiAppId, req.organizationId!);

    await logSuccess({
      eventType: "Update",
      description: `Set data exposure for AI App ID ${aiAppId}`,
      functionName: "setDataExposureForAiApp",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: "Failed to set data exposure for AI App",
      functionName: "setDataExposureForAiApp",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getPolicySuggestions(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getPolicySuggestions",
    functionName: "getPolicySuggestions",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const name = req.query.name as string;
    const suggestions = await getPolicySuggestionsQuery(name, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${suggestions.length} policy suggestions`,
      functionName: "getPolicySuggestions",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](suggestions));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve policy suggestions",
      functionName: "getPolicySuggestions",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function promoteFromShadowAi(req: Request, res: Response): Promise<any> {
  const shadowAiToolId = parseShadowAiToolIdParam(req);

  logProcessing({
    description: `starting promoteFromShadowAi for Shadow AI tool ID ${shadowAiToolId}`,
    functionName: "promoteFromShadowAi",
    fileName: "aiApp.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();

  try {
    const aiApp = await promoteFromShadowAiQuery(shadowAiToolId, req.organizationId!, transaction);
    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `Promoted Shadow AI tool ID ${shadowAiToolId} to AI App ID ${aiApp.id}`,
      functionName: "promoteFromShadowAi",
      fileName: "aiApp.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](aiApp));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "Failed to promote Shadow AI tool to AI App",
      functionName: "promoteFromShadowAi",
      fileName: "aiApp.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
