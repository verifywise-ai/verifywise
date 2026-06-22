import { TaskStatus } from "../../domain.layer/enums/task-status.enum";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TasksModel } from "../../domain.layer/models/tasks/tasks.model";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

export interface FetchTasksParams {
  status?: "Open" | "In Progress" | "Completed";
  priority?: "Low" | "Medium" | "High";
  category?: string;
  overdue_only?: boolean;
  limit?: number;
}

interface TaskWithAssignees extends TasksModel {
  assignees?: number[];
  assignee_names?: string[];
  creator_name?: string;
}

const getAllTasksQuery = async (organizationId: number): Promise<TaskWithAssignees[]> => {
  try {
    const tasks = await sequelize.query(
      `SELECT t.*,
        COALESCE(
          (SELECT json_agg(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id AND ta.organization_id = :organizationId),
          '[]'::json
        ) as assignees
       FROM tasks t
       WHERE t.organization_id = :organizationId AND t.status != :deletedStatus
       ORDER BY t.created_at DESC`,
      {
        replacements: { organizationId, deletedStatus: TaskStatus.DELETED },
        type: QueryTypes.SELECT,
      },
    );
    return tasks as TaskWithAssignees[];
  } catch (error) {
    logger.error("Error fetching all tasks:", error);
    throw new Error(
      `Failed to fetch tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const fetchTasks = async (
  params: FetchTasksParams,
  organizationId: number,
): Promise<Partial<TaskWithAssignees>[]> => {
  let tasks: TaskWithAssignees[] = [];

  try {
    tasks = await getAllTasksQuery(organizationId);

    // Apply filters
    if (params.status) {
      tasks = tasks.filter((t) => t.status === params.status);
    }
    if (params.priority) {
      tasks = tasks.filter((t) => t.priority === params.priority);
    }
    if (params.category) {
      tasks = tasks.filter((t) => {
        const categories = t.categories || [];
        return categories.some((cat: string) =>
          cat.toLowerCase().includes(params.category!.toLowerCase()),
        );
      });
    }
    if (params.overdue_only) {
      const now = new Date();
      tasks = tasks.filter((t) => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate < now && t.status !== TaskStatus.COMPLETED;
      });
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      tasks = tasks.slice(0, params.limit);
    }

    // Return lightweight projections — exclude verbose description
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      categories: t.categories,
      assignees: t.assignees,
      creator_name: t.creator_name,
      created_at: t.created_at,
    }));
  } catch (error) {
    logger.error("Error fetching tasks:", error);
    throw new Error(
      `Failed to fetch tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface TaskAnalytics {
  statusDistribution: {
    [status: string]: number;
  };
  priorityDistribution: {
    [priority: string]: number;
  };
  categoryDistribution: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  assigneeWorkload: Array<{
    assigneeId: number;
    count: number;
    openCount: number;
    overdueCount: number;
  }>;
  overdueAnalysis: {
    totalOverdue: number;
    overdueByPriority: {
      High: number;
      Medium: number;
      Low: number;
    };
    oldestOverdueDays: number;
  };
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
}

const getTaskAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<TaskAnalytics> => {
  try {
    const tasks = await getAllTasksQuery(organizationId);
    const totalTasks = tasks.length;
    const now = new Date();

    // 1. Status Distribution
    const statusDistribution: { [status: string]: number } = {};
    Object.values(TaskStatus)
      .filter((s) => s !== TaskStatus.DELETED)
      .forEach((status) => {
        statusDistribution[status] = 0;
      });

    tasks.forEach((task) => {
      if (task.status && task.status !== TaskStatus.DELETED) {
        statusDistribution[task.status] = (statusDistribution[task.status] || 0) + 1;
      }
    });

    // 2. Priority Distribution
    const priorityDistribution: { [priority: string]: number } = {};
    Object.values(TaskPriority).forEach((priority) => {
      priorityDistribution[priority] = 0;
    });

    tasks.forEach((task) => {
      if (task.priority) {
        priorityDistribution[task.priority] = (priorityDistribution[task.priority] || 0) + 1;
      }
    });

    // 3. Category Distribution
    const categoryMap = new Map<string, number>();
    tasks.forEach((task) => {
      if (task.categories && Array.isArray(task.categories)) {
        task.categories.forEach((category: string) => {
          categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
        });
      }
    });

    const categoryDistribution = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 4. Assignee Workload
    const assigneeMap = new Map<
      number,
      { count: number; openCount: number; overdueCount: number }
    >();
    tasks.forEach((task) => {
      const assignees = task.assignees || [];
      assignees.forEach((assigneeId: number) => {
        const existing = assigneeMap.get(assigneeId) || {
          count: 0,
          openCount: 0,
          overdueCount: 0,
        };
        existing.count++;
        if (task.status === TaskStatus.OPEN || task.status === TaskStatus.IN_PROGRESS) {
          existing.openCount++;
        }
        if (
          task.due_date &&
          new Date(task.due_date) < now &&
          task.status !== TaskStatus.COMPLETED
        ) {
          existing.overdueCount++;
        }
        assigneeMap.set(assigneeId, existing);
      });
    });

    const assigneeWorkload = Array.from(assigneeMap.entries())
      .map(([assigneeId, data]) => ({
        assigneeId,
        count: data.count,
        openCount: data.openCount,
        overdueCount: data.overdueCount,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. Overdue Analysis
    const overdueTasks = tasks.filter((task) => {
      if (!task.due_date) return false;
      const dueDate = new Date(task.due_date);
      return dueDate < now && task.status !== TaskStatus.COMPLETED;
    });

    const overdueByPriority = {
      High: overdueTasks.filter((t) => t.priority === TaskPriority.HIGH).length,
      Medium: overdueTasks.filter((t) => t.priority === TaskPriority.MEDIUM).length,
      Low: overdueTasks.filter((t) => t.priority === TaskPriority.LOW).length,
    };

    let oldestOverdueDays = 0;
    overdueTasks.forEach((task) => {
      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        const daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > oldestOverdueDays) {
          oldestOverdueDays = daysDiff;
        }
      }
    });

    const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const activeTasks = tasks.filter(
      (t) => t.status === TaskStatus.OPEN || t.status === TaskStatus.IN_PROGRESS,
    ).length;

    return {
      statusDistribution,
      priorityDistribution,
      categoryDistribution,
      assigneeWorkload,
      overdueAnalysis: {
        totalOverdue: overdueTasks.length,
        overdueByPriority,
        oldestOverdueDays,
      },
      totalTasks,
      completedTasks,
      activeTasks,
    };
  } catch (error) {
    logger.error("Error getting task analytics:", error);
    throw new Error(
      `Failed to get task analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface TaskExecutiveSummary {
  totalTasks: number;
  openTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  mediumPriorityTasks: number;
  lowPriorityTasks: number;
  tasksNeedingAttention: Array<{
    id: number;
    title: string;
    priority: string;
    status: string;
    due_date: Date | string | null;
    daysOverdue: number;
  }>;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
  completionProgress: {
    completed: number;
    total: number;
    percentage: number;
  };
  recentTasks: Array<{
    id: number;
    title: string;
    priority: string;
    status: string;
    created_at: Date | string;
  }>;
}

const getTaskExecutiveSummary = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<TaskExecutiveSummary> => {
  try {
    const tasks = await getAllTasksQuery(organizationId);
    const totalTasks = tasks.length;
    const now = new Date();

    // Count by status
    const openTasks = tasks.filter((t) => t.status === TaskStatus.OPEN).length;
    const inProgressTasks = tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;
    const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;

    // Count overdue
    const overdueTasks = tasks.filter((t) => {
      if (!t.due_date) return false;
      const dueDate = new Date(t.due_date);
      return dueDate < now && t.status !== TaskStatus.COMPLETED;
    }).length;

    // Count by priority
    const highPriorityTasks = tasks.filter((t) => t.priority === TaskPriority.HIGH).length;
    const mediumPriorityTasks = tasks.filter((t) => t.priority === TaskPriority.MEDIUM).length;
    const lowPriorityTasks = tasks.filter((t) => t.priority === TaskPriority.LOW).length;

    // Tasks needing attention (overdue or high priority and not completed)
    const tasksNeedingAttention = tasks
      .filter((t) => {
        const isOverdue =
          t.due_date && new Date(t.due_date) < now && t.status !== TaskStatus.COMPLETED;
        const isHighPriorityActive =
          t.priority === TaskPriority.HIGH && t.status !== TaskStatus.COMPLETED;
        return isOverdue || isHighPriorityActive;
      })
      .map((t) => {
        let daysOverdue = 0;
        if (t.due_date && new Date(t.due_date) < now && t.status !== TaskStatus.COMPLETED) {
          daysOverdue = Math.floor(
            (now.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24),
          );
        }
        return {
          id: t.id || 0,
          title: t.title,
          priority: t.priority,
          status: t.status,
          due_date: t.due_date || null,
          daysOverdue,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 5);

    // Top categories
    const categoryMap = new Map<string, number>();
    tasks.forEach((task) => {
      if (task.categories && Array.isArray(task.categories)) {
        task.categories.forEach((category: string) => {
          categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
        });
      }
    });

    const topCategories = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Completion progress
    const completionProgress = {
      completed: completedTasks,
      total: totalTasks,
      percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };

    // Recent tasks (last 5)
    const recentTasks = tasks
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5)
      .map((t) => ({
        id: t.id || 0,
        title: t.title,
        priority: t.priority,
        status: t.status,
        created_at: t.created_at || new Date(),
      }));

    return {
      totalTasks,
      openTasks,
      inProgressTasks,
      completedTasks,
      overdueTasks,
      highPriorityTasks,
      mediumPriorityTasks,
      lowPriorityTasks,
      tasksNeedingAttention,
      topCategories,
      completionProgress,
      recentTasks,
    };
  } catch (error) {
    logger.error("Error getting task executive summary:", error);
    throw new Error(
      `Failed to get task executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// ── Write Tools (Human Confirmation Flow) ──────────────────────────────

import { createWriteToolFn } from "../confirmation/createWriteTool";

const agentCreateTask = createWriteToolFn({
  toolName: "agent_create_task",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Create task "${params.title}"${params.priority ? ` with ${params.priority} priority` : ""}${params.assigned_to ? ` assigned to user #${params.assigned_to}` : ""}`,
  executeFn: async (params, organizationId) => {
    const categories = params.category ? [params.category as string] : [];
    const userId = (params._userId as number) || 0;

    const result = await sequelize.transaction(async (transaction) => {
      const taskData = {
        title: params.title as string,
        description: (params.description as string) || null,
        creator_id: userId,
        due_date: params.due_date ? new Date(params.due_date as string) : null,
        priority: (params.priority as string) || TaskPriority.MEDIUM,
        status: (params.status as string) || TaskStatus.OPEN,
        categories,
        is_demo: false,
      };

      const [created] = await sequelize.query(
        `INSERT INTO tasks (organization_id, title, description, creator_id, due_date, priority, status, categories, is_demo)
         VALUES (:organization_id, :title, :description, :creator_id, :due_date, :priority, :status, :categories, :is_demo)
         RETURNING *`,
        {
          replacements: {
            organization_id: organizationId,
            title: taskData.title,
            description: taskData.description,
            creator_id: taskData.creator_id,
            due_date: taskData.due_date,
            priority: taskData.priority,
            status: taskData.status,
            categories: JSON.stringify(categories),
            is_demo: false,
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      // Handle assignee
      if (params.assigned_to) {
        await sequelize.query(
          `INSERT INTO task_assignees (organization_id, task_id, user_id) VALUES (:organization_id, :task_id, :user_id)`,
          {
            replacements: {
              organization_id: organizationId,
              task_id: (created as any).id,
              user_id: params.assigned_to as number,
            },
            transaction,
          },
        );
      }

      return created;
    });

    return result;
  },
});

const agentUpdateTask = createWriteToolFn({
  toolName: "agent_update_task",
  warningLevel: "warning",
  descriptionFn: (params) => {
    const fields = Object.keys(params).filter(
      (k) => k !== "task_id" && k !== "_userId" && k !== "_organizationId",
    );
    return `Update task #${params.task_id} — fields: ${fields.join(", ")}`;
  },
  executeFn: async (params, organizationId) => {
    const taskId = params.task_id as number;
    const updateFields: string[] = [];
    const replacements: Record<string, unknown> = { organizationId, id: taskId };

    if (params.title !== undefined) {
      updateFields.push("title = :title");
      replacements.title = params.title;
    }
    if (params.description !== undefined) {
      updateFields.push("description = :description");
      replacements.description = params.description;
    }
    if (params.status !== undefined) {
      updateFields.push("status = :status");
      replacements.status = params.status;
    }
    if (params.priority !== undefined) {
      updateFields.push("priority = :priority");
      replacements.priority = params.priority;
    }
    if (params.category !== undefined) {
      updateFields.push("categories = :categories");
      replacements.categories = JSON.stringify([params.category]);
    }
    if (params.due_date !== undefined) {
      updateFields.push("due_date = :due_date");
      replacements.due_date = params.due_date;
    }

    if (updateFields.length === 0) {
      throw new Error("No valid fields provided for update");
    }

    const [result] = await sequelize.query(
      `UPDATE tasks SET ${updateFields.join(", ")} WHERE organization_id = :organizationId AND id = :id AND status != :deletedStatus RETURNING *`,
      {
        replacements: { ...replacements, deletedStatus: TaskStatus.DELETED },
        type: QueryTypes.SELECT,
      },
    );

    if (!result) {
      throw new Error(`Task #${taskId} not found`);
    }

    return result;
  },
});

const agentAssignTask = createWriteToolFn({
  toolName: "agent_assign_task",
  warningLevel: "info",
  descriptionFn: (params) => `Assign task #${params.task_id} to user #${params.assigned_to}`,
  executeFn: async (params, organizationId) => {
    const taskId = params.task_id as number;
    const userId = params.assigned_to as number;

    // Verify task exists
    const [task] = await sequelize.query(
      `SELECT id FROM tasks WHERE organization_id = :organizationId AND id = :taskId AND status != :deletedStatus`,
      {
        replacements: { organizationId, taskId, deletedStatus: TaskStatus.DELETED },
        type: QueryTypes.SELECT,
      },
    );
    if (!task) {
      throw new Error(`Task #${taskId} not found`);
    }

    // Remove existing assignment for this user if any, then insert
    await sequelize.query(
      `DELETE FROM task_assignees WHERE organization_id = :organizationId AND task_id = :taskId AND user_id = :userId`,
      { replacements: { organizationId, taskId, userId } },
    );
    await sequelize.query(
      `INSERT INTO task_assignees (organization_id, task_id, user_id) VALUES (:organizationId, :taskId, :userId)`,
      { replacements: { organizationId, taskId, userId } },
    );

    return { task_id: taskId, assigned_to: userId, success: true };
  },
});

const agentUpdateTaskStatus = createWriteToolFn({
  toolName: "agent_update_task_status",
  warningLevel: "warning",
  descriptionFn: (params) => `Change status of task #${params.task_id} to "${params.status}"`,
  executeFn: async (params, organizationId) => {
    const taskId = params.task_id as number;
    const status = params.status as string;

    const [result] = await sequelize.query(
      `UPDATE tasks SET status = :status WHERE organization_id = :organizationId AND id = :id AND status != :deletedStatus RETURNING *`,
      {
        replacements: { organizationId, id: taskId, status, deletedStatus: TaskStatus.DELETED },
        type: QueryTypes.SELECT,
      },
    );

    if (!result) {
      throw new Error(`Task #${taskId} not found`);
    }

    return result;
  },
});

const agentSetTaskPriority = createWriteToolFn({
  toolName: "agent_set_task_priority",
  warningLevel: "info",
  descriptionFn: (params) => `Set priority of task #${params.task_id} to "${params.priority}"`,
  executeFn: async (params, organizationId) => {
    const taskId = params.task_id as number;
    const priority = params.priority as string;

    const [result] = await sequelize.query(
      `UPDATE tasks SET priority = :priority WHERE organization_id = :organizationId AND id = :id AND status != :deletedStatus RETURNING *`,
      {
        replacements: { organizationId, id: taskId, priority, deletedStatus: TaskStatus.DELETED },
        type: QueryTypes.SELECT,
      },
    );

    if (!result) {
      throw new Error(`Task #${taskId} not found`);
    }

    return result;
  },
});

const agentDeleteTask = createWriteToolFn({
  toolName: "agent_delete_task",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete (archive) task #${params.task_id}`,
  executeFn: async (params, organizationId) => {
    const taskId = params.task_id as number;

    const [result] = await sequelize.query(
      `UPDATE tasks SET status = :deletedStatus WHERE organization_id = :organizationId AND id = :id AND status != :deletedStatus RETURNING *`,
      {
        replacements: { organizationId, id: taskId, deletedStatus: TaskStatus.DELETED },
        type: QueryTypes.SELECT,
      },
    );

    if (!result) {
      throw new Error(`Task #${taskId} not found or already deleted`);
    }

    return { task_id: taskId, deleted: true };
  },
});

const agentRestoreTask = createWriteToolFn({
  toolName: "agent_restore_task",
  warningLevel: "info",
  descriptionFn: (params) => `Restore archived task #${params.task_id} back to Open status`,
  executeFn: async (params, organizationId) => {
    const taskId = params.task_id as number;

    const [result] = await sequelize.query(
      `UPDATE tasks SET status = :openStatus WHERE organization_id = :organizationId AND id = :id AND status = :deletedStatus RETURNING *`,
      {
        replacements: {
          organizationId,
          id: taskId,
          openStatus: TaskStatus.OPEN,
          deletedStatus: TaskStatus.DELETED,
        },
        type: QueryTypes.SELECT,
      },
    );

    if (!result) {
      throw new Error(`Task #${taskId} not found or is not archived`);
    }

    return result;
  },
});

const availableTaskTools: Record<string, Function> = {
  fetch_tasks: fetchTasks,
  get_task_analytics: getTaskAnalytics,
  get_task_executive_summary: getTaskExecutiveSummary,
  agent_create_task: agentCreateTask,
  agent_update_task: agentUpdateTask,
  agent_assign_task: agentAssignTask,
  agent_update_task_status: agentUpdateTaskStatus,
  agent_set_task_priority: agentSetTaskPriority,
  agent_delete_task: agentDeleteTask,
  agent_restore_task: agentRestoreTask,
};

export { availableTaskTools };
