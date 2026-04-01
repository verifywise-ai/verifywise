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
      }
    );
    return tasks as TaskWithAssignees[];
  } catch (error) {
    logger.error("Error fetching all tasks:", error);
    throw new Error(
      `Failed to fetch tasks: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const fetchTasks = async (
  params: FetchTasksParams,
  organizationId: number
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
          cat.toLowerCase().includes(params.category!.toLowerCase())
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
      `Failed to fetch tasks: ${error instanceof Error ? error.message : "Unknown error"}`
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
  organizationId: number
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
        priorityDistribution[task.priority] =
          (priorityDistribution[task.priority] || 0) + 1;
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
    const assigneeMap = new Map<number, { count: number; openCount: number; overdueCount: number }>();
    tasks.forEach((task) => {
      const assignees = task.assignees || [];
      assignees.forEach((assigneeId: number) => {
        const existing = assigneeMap.get(assigneeId) || {
          count: 0,
          openCount: 0,
          overdueCount: 0,
        };
        existing.count++;
        if (
          task.status === TaskStatus.OPEN ||
          task.status === TaskStatus.IN_PROGRESS
        ) {
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
        const daysDiff = Math.floor(
          (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff > oldestOverdueDays) {
          oldestOverdueDays = daysDiff;
        }
      }
    });

    const completedTasks = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED
    ).length;
    const activeTasks = tasks.filter(
      (t) =>
        t.status === TaskStatus.OPEN || t.status === TaskStatus.IN_PROGRESS
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
      `Failed to get task analytics: ${error instanceof Error ? error.message : "Unknown error"}`
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
  organizationId: number
): Promise<TaskExecutiveSummary> => {
  try {
    const tasks = await getAllTasksQuery(organizationId);
    const totalTasks = tasks.length;
    const now = new Date();

    // Count by status
    const openTasks = tasks.filter((t) => t.status === TaskStatus.OPEN).length;
    const inProgressTasks = tasks.filter(
      (t) => t.status === TaskStatus.IN_PROGRESS
    ).length;
    const completedTasks = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETED
    ).length;

    // Count overdue
    const overdueTasks = tasks.filter((t) => {
      if (!t.due_date) return false;
      const dueDate = new Date(t.due_date);
      return dueDate < now && t.status !== TaskStatus.COMPLETED;
    }).length;

    // Count by priority
    const highPriorityTasks = tasks.filter(
      (t) => t.priority === TaskPriority.HIGH
    ).length;
    const mediumPriorityTasks = tasks.filter(
      (t) => t.priority === TaskPriority.MEDIUM
    ).length;
    const lowPriorityTasks = tasks.filter(
      (t) => t.priority === TaskPriority.LOW
    ).length;

    // Tasks needing attention (overdue or high priority and not completed)
    const tasksNeedingAttention = tasks
      .filter((t) => {
        const isOverdue =
          t.due_date &&
          new Date(t.due_date) < now &&
          t.status !== TaskStatus.COMPLETED;
        const isHighPriorityActive =
          t.priority === TaskPriority.HIGH &&
          t.status !== TaskStatus.COMPLETED;
        return isOverdue || isHighPriorityActive;
      })
      .map((t) => {
        let daysOverdue = 0;
        if (
          t.due_date &&
          new Date(t.due_date) < now &&
          t.status !== TaskStatus.COMPLETED
        ) {
          daysOverdue = Math.floor(
            (now.getTime() - new Date(t.due_date).getTime()) /
              (1000 * 60 * 60 * 24)
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
      percentage:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
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
      `Failed to get task executive summary: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const availableTaskTools: Record<string, Function> = {
  fetch_tasks: fetchTasks,
  get_task_analytics: getTaskAnalytics,
  get_task_executive_summary: getTaskExecutiveSummary,
};

export { availableTaskTools };
