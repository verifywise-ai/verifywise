import { Request, Response } from "express";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { notifyUserAssigned } from "../services/inAppNotification.service";
import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import {
  getAllModelInventoriesQuery,
  getModelInventoryByIdQuery,
  createNewModelInventoryQuery,
  updateModelInventoryByIdQuery,
  deleteModelInventoryByIdQuery,
  getModelByProjectIdQuery,
  getModelByFrameworkIdQuery,
} from "../utils/modelInventory.utils";
import {
  recordModelInventoryCreation,
  recordModelInventoryDeletion,
  trackModelInventoryChanges,
  recordMultipleFieldChanges,
} from "../utils/modelInventoryChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";

// Helper function to get user name
async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

export async function getAllModelInventories(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllModelInventories",
    "getAllModelInventories",
    "modelInventory.ctrl.ts"
  );
  logger.debug("🔍 Fetching all model inventories");

  try {
    const modelInventories = (await getAllModelInventoriesQuery(
      req.organizationId!
    )) as unknown as ModelInventoryModel[];
    if (modelInventories && modelInventories.length > 0) {
      logStructured(
        "successful",
        "model inventories found",
        "getAllModelInventories",
        "modelInventory.ctrl.ts"
      );
      return res
        .status(200)
        .json(
          STATUS_CODE[200](
            modelInventories.map((modelInventory) =>
              modelInventory.toSafeJSON()
            )
          )
        );
    }

    logStructured(
      "successful",
      "no model inventories found",
      "getAllModelInventories",
      "modelInventory.ctrl.ts"
    );
    return res.status(200).json(STATUS_CODE[200](modelInventories));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventories",
      "getAllModelInventories",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in getAllModelInventories:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getModelInventoryById(req: Request, res: Response) {
  const modelInventoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logStructured(
    "processing",
    `fetching model inventory by id: ${modelInventoryId}`,
    "getModelInventoryById",
    "modelInventory.ctrl.ts"
  );
  logger.debug(`🔍 Looking up model inventory with id: ${modelInventoryId}`);

  try {
    const modelInventory = (await getModelInventoryByIdQuery(
      modelInventoryId,
      req.organizationId!
    )) as unknown as ModelInventoryModel;
    if (modelInventory) {
      logStructured(
        "successful",
        `model inventory found: ${modelInventoryId}`,
        "getModelInventoryById",
        "modelInventory.ctrl.ts"
      );
      return res
        .status(200)
        .json(STATUS_CODE[200](modelInventory.toSafeJSON()));
    }
    logStructured(
      "successful",
      `no model inventory found: ${modelInventoryId}`,
      "getModelInventoryById",
      "modelInventory.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](modelInventory));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventory",
      "getModelInventoryById",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in getModelInventoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getModelByProjectId(req: Request, res: Response) {
  const projectIdParam = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
  const projectId = parseInt(projectIdParam);

  // Return empty array for non-numeric project IDs (e.g., plugin-sourced IDs like "plugin-prefix-2")
  if (isNaN(projectId)) {
    return res.status(200).json(STATUS_CODE[200]([]));
  }

  logStructured(
    "processing",
    `fetching model inventory by project id: ${projectId}`,
    "getModelByProjectId",
    "modelInventory.ctrl.ts"
  );
  logger.debug(`🔍 Looking up model inventory with project id: ${projectId}`);

  try {
    const modelInventories = (await getModelByProjectIdQuery(
      projectId,
      req.organizationId!
    )) as unknown as ModelInventoryModel[];

    logStructured(
      "successful",
      `model inventories retrieved for project id: ${projectId}`,
      "getModelByProjectId",
      "modelInventory.ctrl.ts"
    );
    return res
      .status(200)
      .json(
        STATUS_CODE[200](
          modelInventories.map((modelInventory) => modelInventory.toSafeJSON())
        )
      );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventories by project id",
      "getModelByProjectId",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in getModelByProjectId:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getModelByFrameworkId(req: Request, res: Response) {
  const frameworkId = parseInt(Array.isArray(req.params.frameworkId) ? req.params.frameworkId[0] : req.params.frameworkId);

  logStructured(
    "processing",
    `fetching model inventory by framework id: ${frameworkId}`,
    "getModelByFrameworkId",
    "modelInventory.ctrl.ts"
  );
  logger.debug(
    `🔍 Looking up model inventory with framework id: ${frameworkId}`
  );

  try {
    const modelInventories = (await getModelByFrameworkIdQuery(
      frameworkId,
      req.organizationId!
    )) as unknown as ModelInventoryModel[];

    logStructured(
      "successful",
      `model inventories retrieved for framework id: ${frameworkId}`,
      "getModelByFrameworkId",
      "modelInventory.ctrl.ts"
    );
    return res
      .status(200)
      .json(
        STATUS_CODE[200](
          modelInventories.map((modelInventory) => modelInventory.toSafeJSON())
        )
      );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventories by framework id",
      "getModelByFrameworkId",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in getModelByFrameworkId:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createNewModelInventory(req: Request, res: Response) {
  const {
    provider_model,
    provider,
    model,
    version,
    approver,
    capabilities,
    security_assessment,
    status,
    status_date,
    reference_link,
    biases,
    limitations,
    hosting_provider,
    security_assessment_data,
    is_demo,
    projects,
    frameworks,
  } = req.body;

  logStructured(
    "processing",
    "starting createNewModelInventory",
    "createNewModelInventory",
    "modelInventory.ctrl.ts"
  );
  logger.debug("🔍 Creating new model inventory");

  let transaction: Transaction | null = null;

  try {
    // Create new model inventory instance using the static method for validation
    const modelInventory = ModelInventoryModel.createNewModelInventory({
      provider_model,
      provider,
      model,
      version,
      approver,
      capabilities,
      security_assessment,
      status,
      status_date,
      reference_link,
      biases,
      limitations,
      hosting_provider,
      security_assessment_data,
      is_demo,
    });

    // Create transaction and use the existing database query approach
    transaction = await sequelize.transaction();
    const savedModelInventory = await createNewModelInventoryQuery(
      modelInventory,
      req.organizationId!,
      projects || [],
      frameworks || [],
      transaction
    );

    // Record creation in change history
    await recordModelInventoryCreation(
      savedModelInventory.id!,
      req.userId!,
      req.organizationId!,
      modelInventory,
      transaction
    );

    await transaction.commit();

    // Notify approver if assigned
    if (approver) {
      const assignerName = await getUserNameById(req.userId!);
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      // Build model context
      const modelDetails = [
        savedModelInventory.provider ? `Provider: ${savedModelInventory.provider}` : null,
        savedModelInventory.version ? `Version: ${savedModelInventory.version}` : null,
      ].filter(Boolean).join(" | ");

      notifyUserAssigned(
        req.organizationId!,
        approver,
        {
          entityType: "Model Inventory",
          entityId: savedModelInventory.id!,
          entityName: savedModelInventory.model || `Model #${savedModelInventory.id}`,
          roleType: "Approver",
          entityUrl: `${baseUrl}/model-inventory?modelId=${savedModelInventory.id}`,
        },
        assignerName,
        baseUrl,
        {
          description: modelDetails || undefined,
        }
      ).catch((err) => console.error("Failed to send approver notification:", err));
    }

    logStructured(
      "successful",
      "new model inventory created",
      "createNewModelInventory",
      "modelInventory.ctrl.ts"
    );
    return res
      .status(201)
      .json(STATUS_CODE[201](savedModelInventory.toSafeJSON()));
  } catch (error) {
    // Rollback transaction if it exists
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // Transaction might already be committed, ignore rollback errors
        console.warn("Transaction rollback failed:", rollbackError);
      }
    }

    logStructured(
      "error",
      "failed to create new model inventory",
      "createNewModelInventory",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in createNewModelInventory:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateModelInventoryById(req: Request, res: Response) {
  const modelInventoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Get existing model inventory for business rule validation
  try {
    (await getModelInventoryByIdQuery(
      modelInventoryId,
      req.organizationId!
    )) as unknown as ModelInventoryModel;
  } catch (error) {
    // Continue without existing data if query fails
  }

  const {
    provider_model,
    provider,
    model,
    version,
    approver,
    capabilities,
    security_assessment,
    status,
    status_date,
    reference_link,
    biases,
    limitations,
    hosting_provider,
    security_assessment_data,
    is_demo,
    projects,
    frameworks,
    deleteProjects,
    deleteFrameworks,
  } = req.body;

  logStructured(
    "processing",
    "starting updateModelInventoryById",
    "updateModelInventoryById",
    "modelInventory.ctrl.ts"
  );
  logger.debug("🔍 Updating model inventory by id");

  let transaction: Transaction | null = null;

  try {
    // Get existing model inventory (re-fetch to ensure it exists)
    const currentModelInventory = (await getModelInventoryByIdQuery(
      modelInventoryId,
      req.organizationId!
    )) as unknown as ModelInventoryModel;

    if (!currentModelInventory) {
      logStructured(
        "successful",
        "no model inventory found",
        "updateModelInventoryById",
        "modelInventory.ctrl.ts"
      );
      return res
        .status(404)
        .json(STATUS_CODE[404]("Model inventory not found"));
    }

    // Track changes before updating
    const changes = await trackModelInventoryChanges(currentModelInventory, {
      provider_model,
      provider,
      model,
      version,
      approver,
      capabilities,
      security_assessment,
      status,
      status_date,
      reference_link,
      biases,
      limitations,
      hosting_provider,
      security_assessment_data,
      is_demo,
    });

    // Update the model inventory using the static method
    const updatedModelInventory = ModelInventoryModel.updateModelInventory(
      currentModelInventory,
      {
        provider_model,
        provider,
        model,
        version,
        approver,
        capabilities,
        security_assessment,
        status,
        status_date,
        reference_link,
        biases,
        limitations,
        hosting_provider,
        security_assessment_data,
        is_demo,
      }
    );

    // Use the existing database query approach for updating
    transaction = await sequelize.transaction();
    const savedModelInventory = await updateModelInventoryByIdQuery(
      modelInventoryId,
      updatedModelInventory,
      projects || [],
      frameworks || [],
      deleteProjects || false,
      deleteFrameworks || false,
      req.organizationId!,
      transaction
    );

    // Record changes in change history
    if (changes.length > 0) {
      await recordMultipleFieldChanges(
        modelInventoryId,
        req.userId!,
        req.organizationId!,
        changes,
        transaction
      );
    }

    await transaction.commit();

    // Notify approver if changed to a new user
    const oldApprover = (currentModelInventory as any).approver;
    if (approver && approver !== oldApprover) {
      const assignerName = await getUserNameById(req.userId!);
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      // Build model context
      const modelDetails = [
        savedModelInventory.provider ? `Provider: ${savedModelInventory.provider}` : null,
        savedModelInventory.version ? `Version: ${savedModelInventory.version}` : null,
      ].filter(Boolean).join(" | ");

      notifyUserAssigned(
        req.organizationId!,
        approver,
        {
          entityType: "Model Inventory",
          entityId: modelInventoryId,
          entityName: savedModelInventory.model || `Model #${modelInventoryId}`,
          roleType: "Approver",
          entityUrl: `${baseUrl}/model-inventory?modelId=${modelInventoryId}`,
        },
        assignerName,
        baseUrl,
        {
          description: modelDetails || undefined,
        }
      ).catch((err) => console.error("Failed to send approver notification:", err));
    }

    logStructured(
      "successful",
      "model inventory updated",
      "updateModelInventoryById",
      "modelInventory.ctrl.ts"
    );
    return res
      .status(200)
      .json(STATUS_CODE[200](savedModelInventory.toSafeJSON()));
  } catch (error) {
    // Rollback transaction if it exists
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // Transaction might already be committed, ignore rollback errors
        console.warn("Transaction rollback failed:", rollbackError);
      }
    }

    logStructured(
      "error",
      "failed to update model inventory",
      "updateModelInventoryById",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in updateModelInventoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteModelInventoryById(req: Request, res: Response) {
  const modelInventoryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const deleteRisks = req.query.deleteRisks === "true";

  logStructured(
    "processing",
    "starting deleteModelInventoryById",
    "deleteModelInventoryById",
    "modelInventory.ctrl.ts"
  );
  logger.debug("🔍 Deleting model inventory by id");

  let transaction: Transaction | null = null;

  try {
    // Check if model inventory exists
    const existingModelInventory = (await getModelInventoryByIdQuery(
      modelInventoryId,
      req.organizationId!
    )) as unknown as ModelInventoryModel;

    if (!existingModelInventory) {
      logStructured(
        "successful",
        "no model inventory found",
        "deleteModelInventoryById",
        "modelInventory.ctrl.ts"
      );
      return res
        .status(404)
        .json(STATUS_CODE[404]("Model inventory not found"));
    }

    // Use the existing database query approach for deleting
    transaction = await sequelize.transaction();

    // Record deletion in change history before deleting
    await recordModelInventoryDeletion(
      modelInventoryId,
      req.userId!,
      req.organizationId!,
      transaction
    );

    await deleteModelInventoryByIdQuery(
      modelInventoryId,
      deleteRisks,
      req.organizationId!,
      transaction
    );
    await transaction.commit();

    logStructured(
      "successful",
      "model inventory deleted",
      "deleteModelInventoryById",
      "modelInventory.ctrl.ts"
    );
    return res
      .status(200)
      .json(STATUS_CODE[200]("Model inventory deleted successfully"));
  } catch (error) {
    // Rollback transaction if it exists
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // Transaction might already be committed, ignore rollback errors
        console.warn("Transaction rollback failed:", rollbackError);
      }
    }

    logStructured(
      "error",
      "failed to delete model inventory",
      "deleteModelInventoryById",
      "modelInventory.ctrl.ts"
    );
    logger.error("❌ Error in deleteModelInventoryById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
