import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createTaskEntityLinkQuery,
  getTaskEntityLinksQuery,
  deleteTaskEntityLinkQuery,
  isValidEntityType,
  entityExistsQuery,
  linkExistsQuery,
  EntityType,
} from "../utils/taskEntityLink.utils";
import { getTaskByIdQuery } from "../utils/task.utils";
import { sequelize } from "../database/db";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";

/**
 * Add an entity link to a task
 * POST /tasks/:id/entities
 */
export async function addTaskEntityLink(
  req: Request,
  res: Response
): Promise<any> {
  const taskId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  logProcessing({
    description: `starting addTaskEntityLink for task ID ${taskId}`,
    functionName: "addTaskEntityLink",
    fileName: "taskEntityLink.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { entity_id, entity_type, entity_name } = req.body;

    // Validate entity_type
    if (!entity_type || !isValidEntityType(entity_type)) {
      await transaction.rollback();
      return res.status(400).json(
        STATUS_CODE[400](`Invalid entity_type: ${entity_type}`)
      );
    }

    // Validate entity_id
    if (!entity_id || typeof entity_id !== "number") {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("entity_id is required"));
    }

    // Check if task exists
    const task = await getTaskByIdQuery(
      taskId,
      { userId, role },
      req.organizationId!
    );

    if (!task) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Task not found"));
    }

    // Check if entity exists
    const entityExists = await entityExistsQuery(
      entity_id,
      entity_type as EntityType,
      req.organizationId!,
      transaction
    );

    if (!entityExists) {
      await transaction.rollback();
      return res.status(404).json(
        STATUS_CODE[404](`${entity_type} with id ${entity_id} not found`)
      );
    }

    // Check if link already exists
    const linkExists = await linkExistsQuery(
      taskId,
      entity_id,
      entity_type as EntityType,
      req.organizationId!,
      transaction
    );

    if (linkExists) {
      await transaction.rollback();
      return res.status(409).json(
        STATUS_CODE[409]("This entity is already linked to this task")
      );
    }

    // Create the link
    const link = await createTaskEntityLinkQuery(
      {
        task_id: taskId,
        entity_id,
        entity_type: entity_type as EntityType,
        entity_name: entity_name || undefined,
      },
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    await logSuccess({
      eventType: "Create",
      description: `Added ${entity_type} entity link to task ${taskId}`,
      functionName: "addTaskEntityLink",
      fileName: "taskEntityLink.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](link));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Create",
      description: "Failed to add entity link to task",
      functionName: "addTaskEntityLink",
      fileName: "taskEntityLink.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get all entity links for a task
 * GET /tasks/:id/entities
 */
export async function getTaskEntityLinks(
  req: Request,
  res: Response
): Promise<any> {
  const taskId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  logProcessing({
    description: `starting getTaskEntityLinks for task ID ${taskId}`,
    functionName: "getTaskEntityLinks",
    fileName: "taskEntityLink.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if task exists
    const task = await getTaskByIdQuery(
      taskId,
      { userId, role },
      req.organizationId!
    );

    if (!task) {
      return res.status(404).json(STATUS_CODE[404]("Task not found"));
    }

    const links = await getTaskEntityLinksQuery(taskId, req.organizationId!);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved entity links for task ${taskId}`,
      functionName: "getTaskEntityLinks",
      fileName: "taskEntityLink.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](links));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to get entity links for task",
      functionName: "getTaskEntityLinks",
      fileName: "taskEntityLink.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Remove an entity link from a task
 * DELETE /tasks/:id/entities/:linkId
 */
export async function removeTaskEntityLink(
  req: Request,
  res: Response
): Promise<any> {
  const taskId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  const linkId = parseInt(
    Array.isArray(req.params.linkId) ? req.params.linkId[0] : req.params.linkId
  );

  logProcessing({
    description: `starting removeTaskEntityLink for task ID ${taskId}, link ID ${linkId}`,
    functionName: "removeTaskEntityLink",
    fileName: "taskEntityLink.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if task exists
    const task = await getTaskByIdQuery(
      taskId,
      { userId, role },
      req.organizationId!
    );

    if (!task) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Task not found"));
    }

    const deleted = await deleteTaskEntityLinkQuery(
      linkId,
      taskId,
      req.organizationId!,
      transaction
    );

    if (!deleted) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("Entity link not found"));
    }

    await transaction.commit();

    await logSuccess({
      eventType: "Delete",
      description: `Removed entity link ${linkId} from task ${taskId}`,
      functionName: "removeTaskEntityLink",
      fileName: "taskEntityLink.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({ message: "Entity link removed successfully" })
    );
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Delete",
      description: "Failed to remove entity link from task",
      functionName: "removeTaskEntityLink",
      fileName: "taskEntityLink.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
