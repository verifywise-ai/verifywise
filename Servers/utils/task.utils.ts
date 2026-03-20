import { TasksModel } from "../domain.layer/models/tasks/tasks.model";
import { TaskAssigneesModel } from "../domain.layer/models/taskAssignees/taskAssignees.model";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { ITask } from "../domain.layer/interfaces/i.task";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";
import { TaskPriority } from "../domain.layer/enums/task-priority.enum";
import { IRoleAttributes } from "../domain.layer/interfaces/i.role";
import {
  NotFoundException,
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import {
  buildTaskReplacements,
  buildTaskUpdateReplacements,
} from "./automation/task.automation.utils";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import { getTaskEntityLinksQuery } from "./taskEntityLink.utils";

interface GetTasksOptions {
  userId: number;
  role: IRoleAttributes["name"];
  transaction?: Transaction;
}

interface TaskFilters {
  status?: string[];
  priority?: string[];
  due_date_start?: string;
  due_date_end?: string;
  category?: string[];
  assignee?: number[];
  organization_id?: number;
  search?: string;
  include_archived?: boolean;
}

interface TaskSortOptions {
  sort_by?: "due_date" | "priority" | "created_at";
  sort_order?: "ASC" | "DESC";
}

interface QueryReplacements {
  [key: string]: any;
}

// Helper function for DRY visibility logic - adds JOIN and WHERE conditions for non-Admin users
const addVisibilityLogic = (
  baseQueryParts: string[],
  whereConditions: string[],
  replacements: QueryReplacements,
  { userId, role }: GetTasksOptions,
  organizationId: number,
  joinAlias: string = "ta"
): void => {
  // SECURITY: Always filter by organization_id to prevent cross-organization access
  whereConditions.push("t.organization_id = :organizationId");
  replacements.organizationId = organizationId;

  if (role !== "Admin") {
    baseQueryParts.push(
      `LEFT JOIN task_assignees ${joinAlias} ON ${joinAlias}.task_id = t.id AND ${joinAlias}.organization_id = :organizationId AND ${joinAlias}.user_id = :userId`
    );
    whereConditions.push(
      `(t.creator_id = :userId OR ${joinAlias}.user_id IS NOT NULL)`
    );
    replacements.userId = userId;
  }
};

// Create a new task
export const createNewTaskQuery = async (
  task: ITask,
  organizationId: number,
  transaction: Transaction,
  assignees?: Array<{ user_id: number }>
): Promise<TasksModel> => {
  const result = await sequelize.query(
    `INSERT INTO tasks (
        organization_id, title, description, creator_id, due_date, priority, status, categories, is_demo
      ) VALUES (
        :organization_id, :title, :description, :creator_id, :due_date, :priority, :status, :categories, :is_demo
      ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        title: task.title,
        description: task.description || null,
        creator_id: task.creator_id,
        due_date: task.due_date || null,
        priority: task.priority || TaskPriority.MEDIUM,
        status: task.status || TaskStatus.OPEN,
        categories: JSON.stringify(task.categories || []),
        is_demo: task.is_demo || false,
      },
      model: TasksModel,
      mapToModel: true,
      transaction,
    }
  );

  const createdTask = result[0] as TasksModel;

  // Handle assignees following the project members pattern
  (createdTask.dataValues as any)["assignees"] = [];

  if (assignees && assignees.length > 0) {
    for (let assignee of assignees) {
      // Handle both formats: string/number directly, or object with user_id property
      const userId =
        typeof assignee === "string" || typeof assignee === "number"
          ? Number(assignee)
          : Number(assignee.user_id);

      if (!isNaN(userId) && userId > 0) {
        await sequelize.query(
          `INSERT INTO task_assignees (organization_id, task_id, user_id) VALUES (:organization_id, :task_id, :user_id) RETURNING *`,
          {
            replacements: {
              organization_id: organizationId,
              task_id: createdTask.id,
              user_id: userId,
            },
            transaction,
          }
        );
        (createdTask.dataValues as any)["assignees"].push(userId);
      }
    }
  }

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organization_id JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organization_id JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'task_added' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organization_id: organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "task_added") {
      const creator_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :creator_id;`,
        {
          replacements: { creator_id: createdTask.dataValues.creator_id },
          transaction,
        }
      )) as [{ full_name: string }[], number];
      const assignee_names = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN (:assignee_ids);`,
        {
          replacements: {
            assignee_ids: (createdTask.dataValues as any)["assignees"],
          },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildTaskReplacements({
        ...createdTask.dataValues,
        creator_name: creator_name[0][0].full_name,
        assignee_names: assignee_names[0].map((a) => a.full_name).join(", "),
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  return createdTask;
};

// GET /tasks: Fetch list with filters (status, due_date range, category, assignee) and sorts (due_date, priority, created_at). Apply pagination (25 items per page, server-side). Enforce visibility rules.
export const getTasksQuery = async (
  { userId, role }: GetTasksOptions,
  organizationId: number,
  filters: TaskFilters = {},
  sort: TaskSortOptions = {},
  options?: { limit?: number; offset?: number }
): Promise<TasksModel[]> => {
  const { limit, offset } = options ?? {};
  const { sort_by = "created_at", sort_order = "DESC" } = sort;

  // Build base query parts following project utils pattern
  const baseQueryParts: string[] = [
    `SELECT DISTINCT t.*`,
    `FROM tasks t`,
  ];

  // Build pagination clause
  const paginationClause =
    limit !== undefined && offset !== undefined
      ? "LIMIT :limit OFFSET :offset"
      : limit !== undefined
        ? "LIMIT :limit"
        : "";

  const whereConditions: string[] = [];
  const replacements: QueryReplacements = {};

  // Only exclude deleted tasks if include_archived is not true
  if (!filters.include_archived) {
    whereConditions.push("t.status != :deletedStatus");
    replacements.deletedStatus = TaskStatus.DELETED;
  }

  // Enforce visibility rules: admins see all, others see tasks where they're creator or assignee
  addVisibilityLogic(
    baseQueryParts,
    whereConditions,
    replacements,
    { userId, role },
    organizationId
  );

  // Apply filters
  if (filters.status && filters.status.length > 0) {
    const statusList = filters.status.map((_s, i) => `:status${i}`).join(", ");
    whereConditions.push(`t.status IN (${statusList})`);
    filters.status.forEach((status, i) => {
      replacements[`status${i}`] = status;
    });
  }

  if (filters.priority && filters.priority.length > 0) {
    const priorityList = filters.priority
      .map((_p, i) => `:priority${i}`)
      .join(", ");
    whereConditions.push(`t.priority IN (${priorityList})`);
    filters.priority.forEach((priority, i) => {
      replacements[`priority${i}`] = priority;
    });
  }

  if (filters.due_date_start) {
    whereConditions.push(`t.due_date >= :due_date_start`);
    replacements.due_date_start = filters.due_date_start;
  }

  if (filters.due_date_end) {
    whereConditions.push(`t.due_date <= :due_date_end`);
    replacements.due_date_end = filters.due_date_end;
  }

  if (filters.category && filters.category.length > 0) {
    // For JSONB array contains any of the categories
    const categoryConditions = filters.category
      .map((_j, i) => `t.categories::jsonb ? :category${i}`)
      .join(" OR ");
    whereConditions.push(`(${categoryConditions})`);
    filters.category.forEach((cat, i) => {
      replacements[`category${i}`] = cat;
    });
  }

  if (filters.assignee && filters.assignee.length > 0) {
    // Add LEFT JOIN for assignee filter if not already added
    if (role === "Admin") {
      baseQueryParts.push(
        `LEFT JOIN task_assignees ta_filter ON ta_filter.task_id = t.id AND ta_filter.organization_id = :organizationId`
      );
    }
    const assigneeList = filters.assignee
      .map((_, i) => `:assignee${i}`)
      .join(", ");
    const joinAlias = role === "Admin" ? "ta_filter" : "ta";
    whereConditions.push(`${joinAlias}.user_id IN (${assigneeList})`);
    filters.assignee.forEach((assignee, i) => {
      replacements[`assignee${i}`] = assignee;
    });
  }

  if (filters.search) {
    whereConditions.push(
      `(t.title ILIKE :search OR t.description ILIKE :search)`
    );
    replacements.search = `%${filters.search}%`;
  }

  // Add WHERE conditions
  if (whereConditions.length > 0) {
    baseQueryParts.push("WHERE " + whereConditions.join(" AND "));
  }

  // Validate sort_order first to ensure we have a valid sortOrder for both cases
  const sortOrders = {
    ASC: "ASC",
    DESC: "DESC",
  } as const;

  if (!(sort_order in sortOrders)) {
    throw new ValidationException(
      "Invalid sort order provided",
      "sort_order",
      sort_order
    );
  }

  const sortOrder = sortOrders[sort_order as keyof typeof sortOrders];

  // Build ORDER clause for sorts (due_date, priority, created_at)
  if (sort_by === "priority") {
    // Custom priority ordering: High=1, Medium=2, Low=3
    baseQueryParts.push(`ORDER BY CASE
      WHEN t.priority = :priorityHigh THEN 1
      WHEN t.priority = :priorityMedium THEN 2
      WHEN t.priority = :priorityLow THEN 3
      END ${sortOrder}, t.created_at DESC`);
    replacements.priorityHigh = TaskPriority.HIGH;
    replacements.priorityMedium = TaskPriority.MEDIUM;
    replacements.priorityLow = TaskPriority.LOW;
  } else {
    // Use hardcoded mapping for sort fields to avoid SQL injection
    const allowedSortFields = {
      due_date: "due_date",
      created_at: "created_at",
    } as const;

    if (!(sort_by in allowedSortFields)) {
      throw new ValidationException(
        "Invalid sort field provided",
        "sort_by",
        sort_by
      );
    }

    // We can safely interpolate these as they come strictly from the defined mappings
    const safeSortBy =
      allowedSortFields[sort_by as keyof typeof allowedSortFields];
    const orderClause = `ORDER BY t.${safeSortBy} ${sortOrder}`;

    if (safeSortBy !== "created_at") {
      baseQueryParts.push(orderClause + ", t.created_at DESC");
    } else {
      baseQueryParts.push(orderClause);
    }
  }

  // Add pagination
  if (paginationClause) {
    baseQueryParts.push(paginationClause);
  }

  // Add pagination parameters to replacements
  if (limit !== undefined) replacements.limit = limit;
  if (offset !== undefined) replacements.offset = offset;

  const finalQuery = baseQueryParts.join("\n");

  // Get tasks with pagination
  const tasks = await sequelize.query(finalQuery, {
    replacements,
    mapToModel: true,
    model: TasksModel,
    type: QueryTypes.SELECT,
  });

  // Add assignees and entity links to each task following the project members pattern
  for (const task of tasks) {
    const assignees = await sequelize.query(
      `SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :task_id`,
      {
        replacements: { organizationId, task_id: task.id },
        mapToModel: true,
        model: TaskAssigneesModel,
      }
    );
    (task.dataValues as any)["assignees"] = assignees.map(
      (a: any) => a.user_id
    );

    // Fetch entity links for this task
    const entityLinks = await getTaskEntityLinksQuery(task.id!, organizationId);
    (task.dataValues as any)["entity_links"] = entityLinks.map((link) => ({
      id: link.id,
      entity_id: link.entity_id,
      entity_type: link.entity_type,
      entity_name: link.entity_name,
    }));
  }

  return tasks as TasksModel[];
};

// Get task by ID with role-based visibility
export const getTaskByIdQuery = async (
  taskId: number,
  { userId, role }: GetTasksOptions,
  organizationId: number
): Promise<TasksModel | null> => {
  const baseQueryParts: string[] = [
    `SELECT DISTINCT t.*`,
    `FROM tasks t`,
  ];
  const whereConditions: string[] = [
    "t.id = :taskId",
    "t.status != :deletedStatus",
  ];
  const replacements: QueryReplacements = {
    taskId,
    deletedStatus: TaskStatus.DELETED,
  };

  // Role-based visibility rules
  addVisibilityLogic(
    baseQueryParts,
    whereConditions,
    replacements,
    { userId, role },
    organizationId
  );

  baseQueryParts.push("WHERE " + whereConditions.join(" AND "));
  const finalQuery = baseQueryParts.join("\n");

  const tasks = await sequelize.query(finalQuery, {
    replacements,
    mapToModel: true,
    model: TasksModel,
    type: QueryTypes.SELECT,
  });

  if (tasks.length > 0) {
    const task = tasks[0] as TasksModel;

    // Add assignees following the project members pattern
    const assignees = await sequelize.query(
      `SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :task_id`,
      {
        replacements: { organizationId, task_id: task.id },
        mapToModel: true,
        model: TaskAssigneesModel,
      }
    );
    (task.dataValues as any)["assignees"] = assignees.map(
      (a: any) => a.user_id
    );

    const creator_name = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :creator_id;`,
      {
        replacements: { creator_id: task.dataValues.creator_id },
      }
    )) as [{ full_name: string }[], number];
    (task.dataValues as any)["creator_name"] = creator_name[0][0].full_name;
    const assignee_names = (await sequelize.query(
      `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN (:assignee_ids);`,
      {
        replacements: { assignee_ids: (task.dataValues as any)["assignees"] },
      }
    )) as [{ full_name: string }[], number];
    (task.dataValues as any)["assignee_names"] = assignee_names[0].map(
      (a) => a.full_name
    );

    // Fetch entity links for this task
    const entityLinks = await getTaskEntityLinksQuery(task.id!, organizationId);
    (task.dataValues as any)["entity_links"] = entityLinks.map((link) => ({
      id: link.id,
      entity_id: link.entity_id,
      entity_type: link.entity_type,
      entity_name: link.entity_name,
    }));

    return task;
  }

  return null;
};

// Update task with permission checks
export const updateTaskByIdQuery = async (
  {
    id,
    task,
    userId,
    role,
    transaction,
  }: {
    id: number;
    task: Partial<ITask>;
    userId: number;
    role: string;
    transaction: Transaction;
  },
  organizationId: number,
  assignees?: number[]
): Promise<TasksModel> => {
  // First, get the task to check permissions
  const existingTask = await getTaskByIdQuery(
    id,
    { userId, role },
    organizationId
  );

  if (!existingTask) {
    throw new NotFoundException("Task not found or access denied", "task", id);
  }

  // Permission checks for specific fields
  const isCreator = existingTask.creator_id === userId;
  const isAdmin = role === "Admin";

  // Check if user is assignee using task_assignees table
  const assigneeCheck = await sequelize.query(
    `SELECT 1 FROM task_assignees WHERE organization_id = :organizationId AND task_id = :taskId AND user_id = :userId`,
    {
      replacements: { organizationId, taskId: id, userId },
      type: QueryTypes.SELECT,
    }
  );
  const isAssignee = assigneeCheck.length > 0;

  // Restrict who can update certain fields - only admin and creator can edit due_date and priority
  if (
    (task.due_date !== undefined || task.priority !== undefined) &&
    !isAdmin &&
    !isCreator
  ) {
    throw new ForbiddenException(
      "Only admin and creator can update due_date and priority",
      "task",
      "update_schedule_priority"
    );
  }

  // Anyone involved (creator, assignee, admin) can update status
  if (task.status !== undefined && !isCreator && !isAssignee && !isAdmin) {
    throw new ForbiddenException(
      "Only task creator, assignee, or admin can update status",
      "task",
      "update_status"
    );
  }

  const updateTask: QueryReplacements = {};
  const setClause = [
    "title",
    "description",
    "due_date",
    "priority",
    "status",
    "categories",
  ]
    .filter((f) => {
      if (task[f as keyof ITask] !== undefined) {
        updateTask[f as keyof ITask] =
          f === "categories"
            ? JSON.stringify(task[f as keyof ITask])
            : task[f as keyof ITask];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  if (!setClause) {
    throw new ValidationException(
      "No valid fields provided for update",
      "task",
      "update_fields"
    );
  }

  const query = `UPDATE tasks SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateTask.id = id;
  updateTask.organizationId = organizationId;

  const result: TasksModel[] = await sequelize.query(query, {
    replacements: updateTask,
    model: TasksModel,
    mapToModel: true,
    type: QueryTypes.SELECT,
    transaction,
  });

  const updatedTask = result[0];

  // Handle assignees update if provided
  if (assignees !== undefined) {
    // Remove existing assignees
    await sequelize.query(
      `DELETE FROM task_assignees WHERE organization_id = :organizationId AND task_id = :taskId`,
      {
        replacements: { organizationId, taskId: id },
        type: QueryTypes.DELETE,
        transaction,
      }
    );

    // Add new assignees if any
    if (assignees && assignees.length > 0) {
      const assigneeValues = assignees
        .map((_assigneeId, index) => `(:organizationId, :taskId, :assignee${index})`)
        .join(", ");

      const assigneeReplacements: any = { organizationId, taskId: id };
      assignees.forEach((assigneeId, index) => {
        assigneeReplacements[`assignee${index}`] = assigneeId;
      });

      await sequelize.query(
        `INSERT INTO task_assignees (organization_id, task_id, user_id) VALUES ${assigneeValues}`,
        {
          replacements: assigneeReplacements,
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    // Add assignees to the response
    (updatedTask.dataValues as any)["assignees"] = assignees;
  } else {
    // Retain existing assignees in the response
    const existingAssignees = await sequelize.query(
      `SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :task_id`,
      {
        replacements: { organizationId, task_id: updatedTask.id },
        mapToModel: true,
        model: TaskAssigneesModel,
      }
    );
    (updatedTask.dataValues as any)["assignees"] = existingAssignees.map(
      (a: any) => a.user_id
    );
  }
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'task_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "task_updated") {
      const creator_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :creator_id;`,
        {
          replacements: { creator_id: updatedTask.dataValues.creator_id },
          transaction,
        }
      )) as [{ full_name: string }[], number];
      const assignee_names = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN (:assignee_ids);`,
        {
          replacements: {
            assignee_ids: (updatedTask.dataValues as any)["assignees"],
          },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildTaskUpdateReplacements(existingTask, {
        ...updatedTask.dataValues,
        creator_name: creator_name[0][0].full_name,
        assignee_names: assignee_names[0].map((a) => a.full_name).join(", "),
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  return updatedTask;
};

// Helper function to get task by ID including archived (for restore/hard delete operations)
const getTaskByIdIncludingArchivedQuery = async (
  taskId: number,
  { userId, role }: GetTasksOptions,
  organizationId: number
): Promise<TasksModel | null> => {
  const baseQueryParts: string[] = [
    `SELECT DISTINCT t.*`,
    `FROM tasks t`,
  ];
  const whereConditions: string[] = ["t.id = :taskId"];
  const replacements: QueryReplacements = { taskId };

  // Role-based visibility rules (without excluding deleted tasks)
  addVisibilityLogic(
    baseQueryParts,
    whereConditions,
    replacements,
    { userId, role },
    organizationId
  );

  baseQueryParts.push("WHERE " + whereConditions.join(" AND "));
  const finalQuery = baseQueryParts.join("\n");

  const tasks = await sequelize.query(finalQuery, {
    replacements,
    mapToModel: true,
    model: TasksModel,
    type: QueryTypes.SELECT,
  });

  if (tasks.length > 0) {
    const task = tasks[0] as TasksModel;

    // Add assignees following the project members pattern
    const assignees = await sequelize.query(
      `SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :task_id`,
      {
        replacements: { organizationId, task_id: task.id },
        mapToModel: true,
        model: TaskAssigneesModel,
      }
    );
    (task.dataValues as any)["assignees"] = assignees.map(
      (a: any) => a.user_id
    );

    return task;
  }

  return null;
};

// Soft delete task (only creator or admin)
export const deleteTaskByIdQuery = async (
  {
    id,
    userId,
    role,
    transaction,
    organizationId,
  }: {
    id: number;
    userId: number;
    role: string;
    transaction: Transaction;
    organizationId: number;
  }
): Promise<boolean> => {
  // Use helper that includes archived tasks to fix 404 bug when archiving already-archived task
  const task = await getTaskByIdIncludingArchivedQuery(
    id,
    { userId, role },
    organizationId
  );

  if (!task) {
    return false;
  }

  // Only creator or admin can delete
  const isCreator = task.creator_id === userId;
  const isAdmin = role === "Admin";

  if (!isCreator && !isAdmin) {
    throw new ForbiddenException(
      "Only task creator or admin can delete tasks",
      "task",
      "delete"
    );
  }

  // Soft delete by setting status to DELETED
  const result = (await sequelize.query(
    `UPDATE tasks SET status = :status WHERE organization_id = :organizationId AND id = :id RETURNING *;`,
    {
      replacements: {
        organizationId,
        status: TaskStatus.DELETED,
        id: id,
      },
      // type: QueryTypes.UPDATE,
      transaction,
    }
  )) as [TasksModel[], number];
  const deletedTask = result[0][0];
  const existingAssignees = await sequelize.query(
    `SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :task_id`,
    {
      replacements: { organizationId, task_id: id },
      mapToModel: true,
      model: TaskAssigneesModel,
    }
  );
  (deletedTask as any)["assignees"] = existingAssignees.map(
    (a: any) => a.user_id
  );
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'task_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "task_deleted") {
      const creator_name = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id = :creator_id;`,
        {
          replacements: { creator_id: deletedTask.creator_id },
          transaction,
        }
      )) as [{ full_name: string }[], number];
      const assignee_names = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN (:assignee_ids);`,
        {
          replacements: { assignee_ids: (deletedTask as any)["assignees"] },
          transaction,
        }
      )) as [{ full_name: string }[], number];

      const params = automation.params!;

      // Build replacements
      const replacements = buildTaskReplacements({
        ...deletedTask,
        creator_name: creator_name[0][0].full_name,
        assignee_names: assignee_names[0].map((a) => a.full_name).join(", "),
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  return true;
};

// Restore archived task (only creator or admin)
export const restoreTaskByIdQuery = async (
  {
    id,
    userId,
    role,
    transaction,
    organizationId,
  }: {
    id: number;
    userId: number;
    role: string;
    transaction: Transaction;
    organizationId: number;
  }
): Promise<TasksModel | null> => {
  // Use helper that includes archived tasks
  const task = await getTaskByIdIncludingArchivedQuery(
    id,
    { userId, role },
    organizationId
  );

  if (!task) {
    return null;
  }

  // Check if task is actually archived
  if (task.status !== TaskStatus.DELETED) {
    throw new ValidationException("Task is not archived", "task", "restore");
  }

  // Only creator or admin can restore
  const isCreator = task.creator_id === userId;
  const isAdmin = role === "Admin";

  if (!isCreator && !isAdmin) {
    throw new ForbiddenException(
      "Only task creator or admin can restore tasks",
      "task",
      "restore"
    );
  }

  // Restore by setting status back to OPEN
  const result = (await sequelize.query(
    `UPDATE tasks SET status = :status WHERE organization_id = :organizationId AND id = :id RETURNING *;`,
    {
      replacements: {
        organizationId,
        status: TaskStatus.OPEN,
        id: id,
      },
      transaction,
    }
  )) as [TasksModel[], number];

  const restoredTask = result[0][0];

  // Add assignees to the response
  const existingAssignees = await sequelize.query(
    `SELECT user_id FROM task_assignees WHERE organization_id = :organizationId AND task_id = :task_id`,
    {
      replacements: { organizationId, task_id: id },
      mapToModel: true,
      model: TaskAssigneesModel,
    }
  );
  (restoredTask as any)["assignees"] = existingAssignees.map(
    (a: any) => a.user_id
  );

  return restoredTask;
};

// Hard delete task - permanently removes from database (only creator or admin)
export const hardDeleteTaskByIdQuery = async (
  {
    id,
    userId,
    role,
    transaction,
    organizationId,
  }: {
    id: number;
    userId: number;
    role: string;
    transaction: Transaction;
    organizationId: number;
  }
): Promise<boolean> => {
  // Use helper that includes archived tasks
  const task = await getTaskByIdIncludingArchivedQuery(
    id,
    { userId, role },
    organizationId
  );

  if (!task) {
    return false;
  }

  // Only creator or admin can hard delete
  const isCreator = task.creator_id === userId;
  const isAdmin = role === "Admin";

  if (!isCreator && !isAdmin) {
    throw new ForbiddenException(
      "Only task creator or admin can permanently delete tasks",
      "task",
      "hard_delete"
    );
  }

  // First delete task assignees
  await sequelize.query(
    `DELETE FROM task_assignees WHERE organization_id = :organizationId AND task_id = :id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.DELETE,
      transaction,
    }
  );

  // Then hard delete the task
  await sequelize.query(
    `DELETE FROM tasks WHERE organization_id = :organizationId AND id = :id RETURNING id;`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.DELETE,
      transaction,
    }
  );

  return true;
};
