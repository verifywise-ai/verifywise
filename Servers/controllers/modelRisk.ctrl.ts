import { Request, Response } from "express";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  getAllModelRisksQuery,
  getModelRiskByIdQuery,
  createNewModelRiskQuery,
  updateModelRiskByIdQuery,
  deleteModelRiskByIdQuery,
} from "../utils/modelRisk.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import {
  recordEntityCreation,
  trackEntityChanges,
  recordMultipleFieldChanges,
  recordEntityDeletion,
} from "../utils/changeHistory.base.utils";

export async function getAllModelRisks(req: Request, res: Response) {
  const filter = (req.query.filter as "active" | "deleted" | "all") || "active";

  logProcessing({
    description: `starting getAllModelRisks with filter: ${filter}`,
    functionName: "getAllModelRisks",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
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
        tenantId: req.organizationId!,
      });
      return res
        .status(200)
        .json(
          STATUS_CODE[200](
            modelRisks.map((modelRisk) => modelRisk.toSafeJSON())
          )
        );
    }

    await logSuccess({
      eventType: "Read",
      description: "no model risks found",
      functionName: "getAllModelRisks",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getModelRiskById(req: Request, res: Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const modelRiskId = parseInt(id, 10);

  logProcessing({
    description: `fetching model risk by ID: ${id}`,
    functionName: "getModelRiskById",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
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
        tenantId: req.organizationId!,
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
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]("Model risk not found."));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve model risk: ${error}`,
      functionName: "getModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createNewModelRisk(req: Request, res: Response) {
  logProcessing({
    description: "creating new model risk",
    functionName: "createNewModelRisk",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction: Transaction = await sequelize.transaction();

  try {
    const modelRisk = await createNewModelRiskQuery(req.body, req.organizationId!, transaction);

    // Record creation in change history
    if (modelRisk.id && req.userId) {
      await recordEntityCreation(
        "model_risk",
        modelRisk.id,
        req.userId,
        req.organizationId!,
        req.body,
        transaction
      );
    }

    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `model risk created: ID ${modelRisk.id}`,
      functionName: "createNewModelRisk",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](modelRisk.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: `Failed to create model risk: ${error}`,
      functionName: "createNewModelRisk",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]((error as Error).message));
  }
}

export async function updateModelRiskById(req: Request, res: Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const modelRiskId = parseInt(id, 10);

  // Get existing model risk for change tracking
  let existingModelRiskData: Record<string, unknown> | null = null;
  try {
    const existingModelRisk = await getModelRiskByIdQuery(modelRiskId, req.organizationId!);
    if (existingModelRisk) {
      existingModelRiskData = existingModelRisk.toSafeJSON ? existingModelRisk.toSafeJSON() : existingModelRisk;
    }
  } catch (error) {
    // Continue without existing data if query fails
  }

  logProcessing({
    description: `updating model risk: ID ${id}`,
    functionName: "updateModelRiskById",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction: Transaction = await sequelize.transaction();

  try {
    const modelRisk = await updateModelRiskByIdQuery(
      modelRiskId,
      req.body,
      req.organizationId!,
      transaction
    );

    if (!modelRisk) {
      await transaction.rollback();
      await logFailure({
        eventType: "Update",
        description: `model risk not found for update: ID ${id}`,
        functionName: "updateModelRiskById",
        fileName: "modelRisk.ctrl.ts",
        error: new Error("Model risk not found"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]("Model risk not found."));
    }

    // Record changes in change history
    if (existingModelRiskData && req.userId) {
      const changes = await trackEntityChanges(
        "model_risk",
        existingModelRiskData,
        req.body
      );
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          "model_risk",
          modelRiskId,
          req.userId,
          req.organizationId!,
          changes,
          transaction
        );
      }
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `model risk updated: ID ${id}`,
      functionName: "updateModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](modelRisk.toSafeJSON()));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to update model risk: ${error}`,
      functionName: "updateModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(400).json(STATUS_CODE[400]((error as Error).message));
  }
}

export async function deleteModelRiskById(req: Request, res: Response) {
  const { id } = req.params;

  logProcessing({
    description: `deleting model risk: ID ${id}`,
    functionName: "deleteModelRiskById",
    fileName: "modelRisk.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction: Transaction = await sequelize.transaction();

  try {
    const success = await deleteModelRiskByIdQuery(
      parseInt(Array.isArray(id) ? id[0] : id, 10),
      req.organizationId!
    );

    if (!success) {
      await transaction.rollback();
      await logFailure({
        eventType: "Delete",
        description: `model risk not found for deletion: ID ${id}`,
        functionName: "deleteModelRiskById",
        fileName: "modelRisk.ctrl.ts",
        error: new Error("Model risk not found"),
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]("Model risk not found."));
    }

    // Record deletion in change history
    const modelRiskId = parseInt(Array.isArray(id) ? id[0] : id, 10);
    if (req.userId) {
      await recordEntityDeletion("model_risk", modelRiskId, req.userId, req.organizationId!, transaction);
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Delete",
      description: `model risk deleted: ID ${id}`,
      functionName: "deleteModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res
      .status(200)
      .json(STATUS_CODE[200]("Model risk deleted successfully."));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete model risk: ${error}`,
      functionName: "deleteModelRiskById",
      fileName: "modelRisk.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
