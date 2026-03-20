import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createNewTaskQuery,
  getTasksQuery,
  getTaskByIdQuery,
  updateTaskByIdQuery,
  deleteTaskByIdQuery,
  restoreTaskByIdQuery,
  hardDeleteTaskByIdQuery,
} from "../utils/task.utils";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { ITask } from "../domain.layer/interfaces/i.task";
import { TaskPriority } from "../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import {
  ValidationException,
  BusinessLogicException,
  ForbiddenException,
} from "../domain.layer/exceptions/custom.exception";
import { notifyTaskAssigned, notifyTaskUpdated, ITaskEntityLinkForEmail } from "../services/inAppNotification.service";
import { getTaskEntityLinksQuery } from "../utils/taskEntityLink.utils";
import {
  recordEntityCreation,
  trackEntityChanges,
  recordMultipleFieldChanges,
  recordEntityDeletion,
} from "../utils/changeHistory.base.utils";

export async function createTask(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createTask",
    functionName: "createTask",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId } = req;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      title,
      description,
      due_date,
      priority,
      status,
      categories,
      assignees,
      entity_links, // Entity links passed for notification purposes
    } = req.body;

    // Create task with current user as creator
    const taskData: ITask = {
      title,
      description,
      creator_id: userId,
      organization_id: req.organizationId,
      due_date: due_date ? new Date(due_date) : undefined,
      priority: priority || TaskPriority.MEDIUM,
      status: status || TaskStatus.OPEN,
      categories: categories || [],
    };

    const task = await createNewTaskQuery(
      taskData,
      req.organizationId!,
      transaction,
      assignees
    );

    // Record creation in change history
    if (task.id && userId) {
      await recordEntityCreation(
        "task",
        task.id,
        userId,
        req.organizationId!,
        taskData,
        transaction
      );
    }

    await transaction.commit();

    // Add assignees to response (manually from dataValues)
    const taskAssignees = (task.dataValues as any)["assignees"] || [];
    const taskResponse = {
      ...task.toJSON(),
      assignees: taskAssignees,
    };

    await logSuccess({
      eventType: "Create",
      description: `Created new task: ${title}`,
      functionName: "createTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // Send notifications to assigned users (async, don't block response)
    if (taskAssignees.length > 0) {
      (async () => {
        try {
          // Get creator name
          const creatorResult = await sequelize.query<{ name: string; surname: string }>(
            `SELECT name, surname FROM users WHERE id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
          );
          const creator = creatorResult[0];
          const creatorName = creator ? `${creator.name} ${creator.surname}`.trim() : "Someone";

          // Get base URL from env or default
          const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

          // Use entity links from request body if provided (frontend knows the current state)
          let entityLinksForEmail: ITaskEntityLinkForEmail[] = [];
          if (entity_links && Array.isArray(entity_links) && entity_links.length > 0) {
            entityLinksForEmail = entity_links.map((link: any) => ({
              entity_id: link.entity_id,
              entity_type: link.entity_type,
              entity_name: link.entity_name || `${link.entity_type} #${link.entity_id}`,
            }));
          }

          // Notify each assignee
          for (const assigneeId of taskAssignees) {
            await notifyTaskAssigned(
              req.organizationId!,
              assigneeId,
              {
                id: task.id!,
                title: task.title,
                description: task.description || undefined,
                priority: task.priority || TaskPriority.MEDIUM,
                due_date: task.due_date?.toISOString(),
                entity_links: entityLinksForEmail,
              },
              creatorName,
              baseUrl
            );
          }
        } catch (notifyError) {
          await logFailure({
            eventType: "Create",
            description: `Failed to send task assignment notifications: ${notifyError}`,
            functionName: "createTask",
            fileName: "task.ctrl.ts",
            error: notifyError as Error,
            userId: req.userId!,
            tenantId: req.organizationId!,
          });
        }
      })();
    }

    return res.status(201).json(STATUS_CODE[201](taskResponse));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Create",
        description: `Validation failed: ${error.message}`,
        functionName: "createTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Create",
      description: "Failed to create task",
      functionName: "createTask",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getAllTasks(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllTasks",
    functionName: "getAllTasks",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Extract query parameters for filters, sorting, and pagination
    const {
      status,
      priority,
      due_date_start,
      due_date_end,
      category,
      assignee,
      search,
      include_archived,
      sort_by = "created_at",
      sort_order = "DESC",
      page = "1",
      page_size = "25",
    } = req.query;

    // Parse filters
    const filters: any = {};
    if (status) filters.status = Array.isArray(status) ? status : [status];
    if (priority)
      filters.priority = Array.isArray(priority) ? priority : [priority];
    if (due_date_start) filters.due_date_start = due_date_start as string;
    if (due_date_end) filters.due_date_end = due_date_end as string;
    if (category)
      filters.category = Array.isArray(category) ? category : [category];
    if (assignee)
      filters.assignee = Array.isArray(assignee)
        ? assignee.map(Number)
        : [Number(assignee)];
    if (search) filters.search = search as string;
    if (include_archived)
      filters.include_archived = include_archived === "true";
    filters.organization_id = Number(req.organizationId);

    // Parse sorting
    const sort = {
      sort_by: sort_by as "due_date" | "priority" | "created_at",
      sort_order: sort_order as "ASC" | "DESC",
    };

    // Parse pagination
    const pageNum = parseInt(page as string, 10);
    const pageSize = parseInt(page_size as string, 10);
    const limit = Math.min(pageSize, 100); // Cap at 100 items per page

    const tasks = await getTasksQuery(
      { userId, role },
      req.organizationId!,
      filters,
      sort
    );

    // Calculate pagination metadata
    const totalTasks = tasks.length; // This is just the current page, we'd need a count query for real total
    const pagination = {
      page: pageNum,
      pageSize: limit,
      total: totalTasks, // This would need to be calculated properly
      totalPages: Math.ceil(totalTasks / limit),
      hasNext: tasks.length === limit,
      hasPrev: pageNum > 1,
    };

    // Add assignees and entity_links to each task response (manually from dataValues)
    const tasksWithAssignees = tasks.map((task) => ({
      ...task.toJSON(),
      assignees: (task.dataValues as any)["assignees"] || [],
      entity_links: (task.dataValues as any)["entity_links"] || [],
    }));

    await logSuccess({
      eventType: "Read",
      description: "Retrieved tasks list",
      functionName: "getAllTasks",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(
      STATUS_CODE[200]({
        tasks: tasksWithAssignees,
        pagination,
      })
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve tasks",
      functionName: "getAllTasks",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getTaskById(req: Request, res: Response): Promise<any> {
  const taskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getTaskById for ID ${taskId}`,
    functionName: "getTaskById",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const task = await getTaskByIdQuery(
      taskId,
      { userId, role },
      req.organizationId!
    );

    if (task) {
      // Add assignees and entity_links to response (manually from dataValues)
      const taskResponse = {
        ...task.toJSON(),
        assignees: (task.dataValues as any)["assignees"] || [],
        entity_links: (task.dataValues as any)["entity_links"] || [],
      };

      await logSuccess({
        eventType: "Read",
        description: `Retrieved task ID ${taskId}`,
        functionName: "getTaskById",
        fileName: "task.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](taskResponse));
    }

    await logSuccess({
      eventType: "Read",
      description: `Task not found: ID ${taskId}`,
      functionName: "getTaskById",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve task by ID",
      functionName: "getTaskById",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateTask(req: Request, res: Response): Promise<any> {
  const taskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Get existing task and assignees for comparison after update
  let existingAssignees: number[] = [];
  let existingTaskData: any = null;
  try {
    const existingTask = await getTaskByIdQuery(
      taskId,
      { userId: req.userId!, role: req.role! },
      req.organizationId!
    );
    if (existingTask) {
      existingAssignees = (existingTask.dataValues as any)["assignees"] || [];
      existingTaskData = existingTask.toJSON();
    }
  } catch (error) {
    // Continue without existing data if query fails
  }

  logProcessing({
    description: `starting updateTask for ID ${taskId}`,
    functionName: "updateTask",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updateData: Partial<ITask> = {};
    const {
      title,
      description,
      due_date,
      priority,
      status,
      categories,
      assignees,
      entity_links, // Entity links passed for notification purposes
    } = req.body;

    // Only include fields that are being updated
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (due_date !== undefined)
      updateData.due_date = due_date ? new Date(due_date) : undefined;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (categories !== undefined) updateData.categories = categories;

    const updatedTask = await updateTaskByIdQuery(
      {
        id: taskId,
        task: updateData,
        userId,
        role,
        transaction,
      },
      req.organizationId!,
      assignees // Pass assignees to the function
    );

    // Record changes in change history
    if (existingTaskData && userId) {
      const changes = await trackEntityChanges("task", existingTaskData, updateData);
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          "task",
          taskId,
          userId,
          req.organizationId!,
          changes,
          transaction
        );
      }
    }

    await transaction.commit();

    await logSuccess({
      eventType: "Update",
      description: `Updated task ID ${taskId}`,
      functionName: "updateTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    // Add assignees to response (manually from dataValues)
    const newAssignees = (updatedTask.dataValues as any)["assignees"] || [];
    const taskResponse = {
      ...updatedTask.toJSON(),
      assignees: newAssignees,
    };

    // Send notifications (async, don't block response)
    (async () => {
      try {
        // Get updater name
        const updaterResult = await sequelize.query<{ name: string; surname: string }>(
          `SELECT name, surname FROM users WHERE id = :userId`,
          { replacements: { userId }, type: QueryTypes.SELECT }
        );
        const updater = updaterResult[0];
        const updaterName = updater ? `${updater.name} ${updater.surname}`.trim() : "Someone";

        // Get base URL from env or default
        const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

        // Use entity links from request body if provided (for immediate notification),
        // otherwise fall back to fetching from DB
        let entityLinksForEmail: ITaskEntityLinkForEmail[] = [];
        if (entity_links && Array.isArray(entity_links) && entity_links.length > 0) {
          // Use passed entity links (frontend knows the current state)
          entityLinksForEmail = entity_links.map((link: any) => ({
            entity_id: link.entity_id,
            entity_type: link.entity_type,
            entity_name: link.entity_name || `${link.entity_type} #${link.entity_id}`,
          }));
        } else {
          // Fall back to fetching from DB (for backwards compatibility)
          const dbEntityLinks = await getTaskEntityLinksQuery(updatedTask.id!, req.organizationId!);
          entityLinksForEmail = dbEntityLinks.map(link => ({
            entity_id: link.entity_id,
            entity_type: link.entity_type,
            entity_name: link.entity_name || `${link.entity_type} #${link.entity_id}`,
          }));
        }

        // Determine newly assigned vs existing assignees
        // Ensure both arrays contain numbers for proper comparison
        const newAssigneesNumeric = newAssignees.map((id: any) => Number(id));
        const existingAssigneesNumeric = existingAssignees.map((id: any) => Number(id));

        const newlyAssigned = newAssigneesNumeric.filter(
          (id: number) => !existingAssigneesNumeric.includes(id)
        );
        const existingAssigneesStillAssigned = newAssigneesNumeric.filter(
          (id: number) => existingAssigneesNumeric.includes(id)
        );

        // Notify newly assigned users with TASK_ASSIGNED email
        for (const assigneeId of newlyAssigned) {
          await notifyTaskAssigned(
            req.organizationId!,
            assigneeId,
            {
              id: updatedTask.id!,
              title: updatedTask.title,
              description: updatedTask.description || undefined,
              priority: updatedTask.priority || TaskPriority.MEDIUM,
              due_date: updatedTask.due_date?.toISOString(),
              entity_links: entityLinksForEmail,
            },
            updaterName,
            baseUrl
          );
        }

        // Notify existing assignees with TASK_UPDATED email
        for (const assigneeId of existingAssigneesStillAssigned) {
          await notifyTaskUpdated(
            req.organizationId!,
            assigneeId,
            {
              id: updatedTask.id!,
              title: updatedTask.title,
              description: updatedTask.description || undefined,
              priority: updatedTask.priority || TaskPriority.MEDIUM,
              status: updatedTask.status || TaskStatus.OPEN,
              due_date: updatedTask.due_date?.toISOString(),
              entity_links: entityLinksForEmail,
            },
            updaterName,
            baseUrl
          );
        }
      } catch (notifyError) {
        await logFailure({
          eventType: "Update",
          description: `Failed to send task notifications: ${notifyError}`,
          functionName: "updateTaskById",
          fileName: "task.ctrl.ts",
          error: notifyError as Error,
          userId: req.userId!,
          tenantId: req.organizationId!,
        });
      }
    })();

    return res.status(200).json(STATUS_CODE[200](taskResponse));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "updateTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Update",
      description: "Failed to update task",
      functionName: "updateTask",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    const statusCode = (error as Error).message.includes("not found")
      ? 404
      : (error as Error).message.includes("Only")
        ? 403
        : 500;

    return res
      .status(statusCode)
      .json(STATUS_CODE[statusCode]((error as Error).message));
  }
}

export async function deleteTask(req: Request, res: Response): Promise<any> {
  const taskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting deleteTask for ID ${taskId}`,
    functionName: "deleteTask",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const deleted = await deleteTaskByIdQuery({
      id: taskId,
      userId,
      role,
      transaction,
      organizationId: req.organizationId!,
    });

    // Record deletion in change history
    if (deleted && userId) {
      await recordEntityDeletion("task", taskId, userId, req.organizationId!, transaction);
    }

    await transaction.commit();

    if (deleted) {
      await logSuccess({
        eventType: "Delete",
        description: `Deleted task ID ${taskId}`,
        functionName: "deleteTask",
        fileName: "task.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res
        .status(200)
        .json(STATUS_CODE[200]({ message: "Task deleted successfully" }));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Task not found for deletion: ID ${taskId}`,
      functionName: "deleteTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    await logFailure({
      eventType: "Delete",
      description: "Failed to delete task",
      functionName: "deleteTask",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    const statusCode = (error as Error).message.includes("not found")
      ? 404
      : (error as Error).message.includes("Only")
        ? 403
        : 500;

    return res
      .status(statusCode)
      .json(STATUS_CODE[statusCode]((error as Error).message));
  }
}

export async function restoreTask(req: Request, res: Response): Promise<any> {
  const taskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting restoreTask for ID ${taskId}`,
    functionName: "restoreTask",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const restoredTask = await restoreTaskByIdQuery({
      id: taskId,
      userId,
      role,
      transaction,
      organizationId: req.organizationId!,
    });

    await transaction.commit();

    if (restoredTask) {
      await logSuccess({
        eventType: "Update",
        description: `Restored task ID ${taskId}`,
        functionName: "restoreTask",
        fileName: "task.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      // Add assignees to response
      const taskResponse = {
        ...restoredTask,
        assignees: (restoredTask as any)["assignees"] || [],
      };

      return res.status(200).json(STATUS_CODE[200](taskResponse));
    }

    await logSuccess({
      eventType: "Update",
      description: `Task not found for restoration: ID ${taskId}`,
      functionName: "restoreTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "restoreTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "restoreTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    if (error instanceof ForbiddenException) {
      await logFailure({
        eventType: "Update",
        description: `Forbidden: ${error.message}`,
        functionName: "restoreTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Update",
      description: "Failed to restore task",
      functionName: "restoreTask",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    const statusCode = (error as Error).message.includes("not found")
      ? 404
      : (error as Error).message.includes("Only")
        ? 403
        : 500;

    return res
      .status(statusCode)
      .json(STATUS_CODE[statusCode]((error as Error).message));
  }
}

export async function hardDeleteTask(
  req: Request,
  res: Response
): Promise<any> {
  const taskId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting hardDeleteTask for ID ${taskId}`,
    functionName: "hardDeleteTask",
    fileName: "task.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  const transaction = await sequelize.transaction();
  try {
    const { userId, role } = req;
    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const deleted = await hardDeleteTaskByIdQuery({
      id: taskId,
      userId,
      role,
      transaction,
      organizationId: req.organizationId!,
    });

    await transaction.commit();

    if (deleted) {
      await logSuccess({
        eventType: "Delete",
        description: `Permanently deleted task ID ${taskId}`,
        functionName: "hardDeleteTask",
        fileName: "task.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      return res
        .status(200)
        .json(STATUS_CODE[200]({ message: "Task permanently deleted" }));
    }

    await logSuccess({
      eventType: "Delete",
      description: `Task not found for permanent deletion: ID ${taskId}`,
      functionName: "hardDeleteTask",
      fileName: "task.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Delete",
        description: `Validation failed: ${error.message}`,
        functionName: "hardDeleteTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Delete",
        description: `Business logic error: ${error.message}`,
        functionName: "hardDeleteTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    if (error instanceof ForbiddenException) {
      await logFailure({
        eventType: "Delete",
        description: `Forbidden: ${error.message}`,
        functionName: "hardDeleteTask",
        fileName: "task.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }

    await logFailure({
      eventType: "Delete",
      description: "Failed to permanently delete task",
      functionName: "hardDeleteTask",
      fileName: "task.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    const statusCode = (error as Error).message.includes("not found")
      ? 404
      : (error as Error).message.includes("Only")
        ? 403
        : 500;

    return res
      .status(statusCode)
      .json(STATUS_CODE[statusCode]((error as Error).message));
  }
}
