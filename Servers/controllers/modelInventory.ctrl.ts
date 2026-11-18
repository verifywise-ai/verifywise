import { Request, Response } from "express";
import { ModelInventoryModel } from "../domain.layer/models/modelInventory/modelInventory.model";
import {
  getAllModelInventoriesQuery,
  getModelInventoryByIdQuery,
  getModelByProjectIdQuery,
  getModelByFrameworkIdQuery,
} from "../utils/modelInventory.utils";
import {
  createModelInventoryService,
  deleteModelInventoryService,
  ModelWriteContext,
  updateModelInventoryService,
} from "../services/modelInventory.service";
import { ModelApprovalForbiddenError } from "../utils/modelApproval.utils";
import { requestCallerIsAdmin } from "../utils/organizationAdmin.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";

export async function getAllModelInventories(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllModelInventories",
    "getAllModelInventories",
    "modelInventory.ctrl.ts",
  );
  logger.debug("🔍 Fetching all model inventories");

  try {
    const modelInventories = (await getAllModelInventoriesQuery(
      req.organizationId!,
    )) as unknown as ModelInventoryModel[];
    if (modelInventories && modelInventories.length > 0) {
      logStructured(
        "successful",
        "model inventories found",
        "getAllModelInventories",
        "modelInventory.ctrl.ts",
      );
      return res
        .status(200)
        .json(
          STATUS_CODE[200](modelInventories.map((modelInventory) => modelInventory.toSafeJSON())),
        );
    }

    logStructured(
      "successful",
      "no model inventories found",
      "getAllModelInventories",
      "modelInventory.ctrl.ts",
    );
    return res.status(200).json(STATUS_CODE[200](modelInventories));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventories",
      "getAllModelInventories",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in getAllModelInventories:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getModelInventoryById(req: Request, res: Response) {
  // The route checks that the id is a positive integer (400 otherwise).
  const modelInventoryId = Number(req.params.id);

  logStructured(
    "processing",
    `fetching model inventory by id: ${modelInventoryId}`,
    "getModelInventoryById",
    "modelInventory.ctrl.ts",
  );
  logger.debug(`🔍 Looking up model inventory with id: ${modelInventoryId}`);

  try {
    const modelInventory = (await getModelInventoryByIdQuery(
      modelInventoryId,
      req.organizationId!,
    )) as unknown as ModelInventoryModel;
    if (modelInventory) {
      logStructured(
        "successful",
        `model inventory found: ${modelInventoryId}`,
        "getModelInventoryById",
        "modelInventory.ctrl.ts",
      );
      return res.status(200).json(STATUS_CODE[200](modelInventory.toSafeJSON()));
    }
    logStructured(
      "successful",
      `no model inventory found: ${modelInventoryId}`,
      "getModelInventoryById",
      "modelInventory.ctrl.ts",
    );
    return res.status(404).json(STATUS_CODE[404](req.t!("Model inventory not found")));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventory",
      "getModelInventoryById",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in getModelInventoryById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getModelByProjectId(req: Request, res: Response) {
  const projectIdParam = Array.isArray(req.params.projectId)
    ? req.params.projectId[0]
    : req.params.projectId;
  const projectId = parseInt(projectIdParam);

  // Return empty array for non-numeric project IDs (e.g., plugin-sourced IDs like "plugin-prefix-2")
  if (isNaN(projectId)) {
    return res.status(200).json(STATUS_CODE[200]([]));
  }

  logStructured(
    "processing",
    `fetching model inventory by project id: ${projectId}`,
    "getModelByProjectId",
    "modelInventory.ctrl.ts",
  );
  logger.debug(`🔍 Looking up model inventory with project id: ${projectId}`);

  try {
    const modelInventories = (await getModelByProjectIdQuery(
      projectId,
      req.organizationId!,
    )) as unknown as ModelInventoryModel[];

    logStructured(
      "successful",
      `model inventories retrieved for project id: ${projectId}`,
      "getModelByProjectId",
      "modelInventory.ctrl.ts",
    );
    return res
      .status(200)
      .json(
        STATUS_CODE[200](modelInventories.map((modelInventory) => modelInventory.toSafeJSON())),
      );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventories by project id",
      "getModelByProjectId",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in getModelByProjectId:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getModelByFrameworkId(req: Request, res: Response) {
  const frameworkId = parseInt(
    Array.isArray(req.params.frameworkId) ? req.params.frameworkId[0] : req.params.frameworkId,
  );

  logStructured(
    "processing",
    `fetching model inventory by framework id: ${frameworkId}`,
    "getModelByFrameworkId",
    "modelInventory.ctrl.ts",
  );
  logger.debug(`🔍 Looking up model inventory with framework id: ${frameworkId}`);

  try {
    const modelInventories = (await getModelByFrameworkIdQuery(
      frameworkId,
      req.organizationId!,
    )) as unknown as ModelInventoryModel[];

    logStructured(
      "successful",
      `model inventories retrieved for framework id: ${frameworkId}`,
      "getModelByFrameworkId",
      "modelInventory.ctrl.ts",
    );
    return res
      .status(200)
      .json(
        STATUS_CODE[200](modelInventories.map((modelInventory) => modelInventory.toSafeJSON())),
      );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve model inventories by framework id",
      "getModelByFrameworkId",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in getModelByFrameworkId:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** invalid_text_representation (enums), invalid_datetime_format, datetime_field_overflow. */
const DATABASE_BAD_VALUE_CODES = new Set(["22P02", "22007", "22008"]);

const writeContext = async (req: Request): Promise<ModelWriteContext> => ({
  organizationId: req.organizationId!,
  userId: req.userId!,
  callerIsAdmin: await requestCallerIsAdmin(req),
  useCaseViewer: { userId: req.userId!, role: req.role! },
});

/**
 * The answer to a refused model write, or null for an unexpected error. A
 * refused approval change answers its own message; another refusal (a use
 * case the caller cannot open) answers "Access denied", as before.
 */
function refusedWrite(req: Request, res: Response, error: unknown): Response | null {
  // A reference the organization does not own (approver, use case,
  // framework) or a malformed field.
  if (error instanceof ValidationException) {
    return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
  }
  if (error instanceof ModelApprovalForbiddenError) {
    return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
  }
  if (error instanceof ForbiddenException) {
    return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
  }
  // A duplicate external_key within the org violates the partial unique index.
  const code =
    (error as { parent?: { code?: string }; original?: { code?: string } })?.parent?.code ??
    (error as { original?: { code?: string } })?.original?.code;
  // A value the database cannot store (an unknown status or type, a bad
  // date): the legacy route does not validate them, so they used to be a 500.
  if (code && DATABASE_BAD_VALUE_CODES.has(code)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("A value in this request is not valid.")));
  }
  if (code === "23505") {
    return res
      .status(409)
      .json(
        STATUS_CODE[409](
          req.t!("A model with this external key already exists in your organization."),
        ),
      );
  }
  return null;
}

/**
 * POST /api/modelInventory and /api/v1/model-inventories. Each linked use
 * case needs the caller's access to that use case (decision 8), checked in
 * the write query. The service applies the approval rule and records history.
 */
export async function createNewModelInventory(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting createNewModelInventory",
    "createNewModelInventory",
    "modelInventory.ctrl.ts",
  );

  try {
    const savedModelInventory = await createModelInventoryService(
      req.body ?? {},
      await writeContext(req),
    );
    logStructured(
      "successful",
      "new model inventory created",
      "createNewModelInventory",
      "modelInventory.ctrl.ts",
    );
    return res.status(201).json(STATUS_CODE[201](savedModelInventory.toSafeJSON()));
  } catch (error) {
    const refused = refusedWrite(req, res, error);
    if (refused) return refused;
    logStructured(
      "error",
      "failed to create new model inventory",
      "createNewModelInventory",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in createNewModelInventory:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * PATCH /api/modelInventory/:id and /api/v1/model-inventories/:id. Linking
 * a use case, or unlinking one, needs the caller's access to that use case
 * (decision 8); a link to a use case the caller cannot open is kept, never
 * removed by its absence from the list.
 */
export async function updateModelInventoryById(req: Request, res: Response) {
  const modelInventoryId = Number(req.params.id);

  logStructured(
    "processing",
    "starting updateModelInventoryById",
    "updateModelInventoryById",
    "modelInventory.ctrl.ts",
  );

  try {
    const savedModelInventory = await updateModelInventoryService(
      modelInventoryId,
      req.body ?? {},
      await writeContext(req),
    );
    if (!savedModelInventory) {
      logStructured(
        "successful",
        "no model inventory found",
        "updateModelInventoryById",
        "modelInventory.ctrl.ts",
      );
      return res.status(404).json(STATUS_CODE[404](req.t!("Model inventory not found")));
    }
    logStructured(
      "successful",
      "model inventory updated",
      "updateModelInventoryById",
      "modelInventory.ctrl.ts",
    );
    return res.status(200).json(STATUS_CODE[200](savedModelInventory.toSafeJSON()));
  } catch (error) {
    const refused = refusedWrite(req, res, error);
    if (refused) return refused;
    logStructured(
      "error",
      "failed to update model inventory",
      "updateModelInventoryById",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in updateModelInventoryById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteModelInventoryById(req: Request, res: Response) {
  const modelInventoryId = Number(req.params.id);
  const deleteRisks = req.query.deleteRisks === "true";

  logStructured(
    "processing",
    "starting deleteModelInventoryById",
    "deleteModelInventoryById",
    "modelInventory.ctrl.ts",
  );

  try {
    await deleteModelInventoryService(
      modelInventoryId,
      { deleteRisks },
      { organizationId: req.organizationId!, userId: req.userId! },
    );
    logStructured(
      "successful",
      "model inventory deleted",
      "deleteModelInventoryById",
      "modelInventory.ctrl.ts",
    );
    return res.status(200).json(STATUS_CODE[200](req.t!("Model inventory deleted successfully")));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Model inventory not found")));
    }
    if (error instanceof ConflictException) {
      logStructured(
        "error",
        `model ${modelInventoryId} has MRM history — delete blocked`,
        "deleteModelInventoryById",
        "modelInventory.ctrl.ts",
      );
      return res
        .status(409)
        .json(
          STATUS_CODE[409](
            req.t!(
              "This model has model risk management validations or findings and cannot be deleted. Decommission it instead to preserve the audit record.",
            ),
          ),
        );
    }
    logStructured(
      "error",
      "failed to delete model inventory",
      "deleteModelInventoryById",
      "modelInventory.ctrl.ts",
    );
    logger.error("❌ Error in deleteModelInventoryById:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
