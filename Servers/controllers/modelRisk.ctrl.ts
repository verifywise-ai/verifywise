import { Request, Response } from "express";
import { getAllModelRisksQuery, getModelRiskByIdQuery } from "../utils/modelRisk.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { translateError } from "../utils/i18n.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  createModelRiskService,
  deleteModelRiskService,
  ModelRiskWriteContext,
  updateModelRiskService,
} from "../services/modelRisk.service";

export async function getAllModelRisks(req: Request, res: Response) {
  const filter = (req.query.filter as "active" | "deleted" | "all") || "active";

  logProcessing({
    description: `starting getAllModelRisks with filter: ${filter}`,
    functionName: "getAllModelRisks",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const modelRisks = await getAllModelRisksQuery(req.organizationId!, filter);
    if (modelRisks && modelRisks.length > 0) {
      await logSuccess({
        eventType: "Read",
        description: "model risks found",
        functionName: "getAllModelRisks",
        fileName: "modelRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res
        .status(200)
        .json(STATUS_CODE[200](modelRisks.map((modelRisk) => modelRisk.toSafeJSON())));
    }

    await logSuccess({
      eventType: "Read",
      description: "no model risks found",
      functionName: "getAllModelRisks",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]([]));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve model risks: ${error}`,
      functionName: "getAllModelRisks",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getModelRiskById(req: Request, res: Response) {
  // The route checks that the id is a positive integer (400 otherwise).
  const id = String(req.params.id);
  const modelRiskId = Number(id);

  logProcessing({
    description: `fetching model risk by ID: ${id}`,
    functionName: "getModelRiskById",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const modelRisk = await getModelRiskByIdQuery(modelRiskId, req.organizationId!);
    if (modelRisk) {
      await logSuccess({
        eventType: "Read",
        description: `model risk found: ID ${id}`,
        functionName: "getModelRiskById",
        fileName: "modelRisk.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](modelRisk.toSafeJSON()));
    }

    await logFailure({
      eventType: "Read",
      description: `model risk not found: ID ${id}`,
      functionName: "getModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: new Error("Model risk not found"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](req.t!("Model risk not found.")));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve model risk: ${error}`,
      functionName: "getModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

const writeContext = (req: Request): ModelRiskWriteContext => ({
  organizationId: req.organizationId!,
  userId: req.userId!,
});

export async function createNewModelRisk(req: Request, res: Response) {
  logProcessing({
    description: "creating new model risk",
    functionName: "createNewModelRisk",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const modelRisk = await createModelRiskService(req.body ?? {}, writeContext(req));
    await logSuccess({
      eventType: "Create",
      description: `model risk created: ID ${modelRisk.id}`,
      functionName: "createNewModelRisk",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](modelRisk.toSafeJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: `Failed to create model risk: ${error}`,
      functionName: "createNewModelRisk",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
}

export async function updateModelRiskById(req: Request, res: Response) {
  // The route checks that the id is a positive integer (400 otherwise).
  const modelRiskId = Number(req.params.id);

  logProcessing({
    description: `updating model risk: ID ${modelRiskId}`,
    functionName: "updateModelRiskById",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    // An archived risk is not found: it cannot be edited.
    const modelRisk = await updateModelRiskService(modelRiskId, req.body ?? {}, writeContext(req));
    if (!modelRisk) {
      await logFailure({
        eventType: "Update",
        description: `model risk not found for update: ID ${modelRiskId}`,
        functionName: "updateModelRiskById",
        fileName: "modelRisk.ctrl.ts",
        error: new Error("Model risk not found"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("Model risk not found.")));
    }
    await logSuccess({
      eventType: "Update",
      description: `model risk updated: ID ${modelRiskId}`,
      functionName: "updateModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](modelRisk.toSafeJSON()));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to update model risk: ${error}`,
      functionName: "updateModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
}

export async function deleteModelRiskById(req: Request, res: Response) {
  const modelRiskId = Number(req.params.id);

  logProcessing({
    description: `deleting model risk: ID ${modelRiskId}`,
    functionName: "deleteModelRiskById",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });

  try {
    const deleted = await deleteModelRiskService(modelRiskId, writeContext(req));
    if (!deleted) {
      await logFailure({
        eventType: "Delete",
        description: `model risk not found for deletion: ID ${modelRiskId}`,
        functionName: "deleteModelRiskById",
        fileName: "modelRisk.ctrl.ts",
        error: new Error("Model risk not found"),
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404](req.t!("Model risk not found.")));
    }
    await logSuccess({
      eventType: "Delete",
      description: `model risk deleted: ID ${modelRiskId}`,
      functionName: "deleteModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](req.t!("Model risk deleted successfully.")));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete model risk: ${error}`,
      functionName: "deleteModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
