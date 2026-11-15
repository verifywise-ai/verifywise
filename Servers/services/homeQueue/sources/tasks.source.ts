import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { TaskStatus } from "../../../domain.layer/enums/task-status.enum";
import { dateSql, toIso } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

/**
 * Not done and not deleted. "Overdue" is a stored status the API accepts, but
 * nothing keeps it current, so it is still open work and overdue itself is
 * derived from due_date below.
 */
const OPEN_STATUSES = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.OVERDUE];

interface TaskRow {
  id: number;
  title: string;
  due_date: string | null;
  status: string;
  priority: string | null;
  created_at: Date | string | null;
}

/**
 * Tasks assigned to me that are still open. The assignee join is the one the
 * Tasks page uses (task.utils.ts addVisibilityLogic). due_date is a DATE and
 * is formatted in SQL so no driver time zone can shift the day.
 */
export const tasksSource: HomeQueueSource = {
  id: "tasks",
  part: "automate",
  isVisible: () => true,
  async load(ctx) {
    const rows = await sequelize.query<TaskRow>(
      `SELECT t.id, t.title, ${dateSql("t.due_date")} AS due_date,
              t.status, t.priority, t.created_at
       FROM tasks t
       JOIN task_assignees ta
         ON ta.task_id = t.id
        AND ta.organization_id = :organizationId
        AND ta.user_id = :userId
       WHERE t.organization_id = :organizationId
         AND t.status IN (:openStatuses)`,
      {
        replacements: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          openStatuses: OPEN_STATUSES,
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((t): HomeQueueItem => ({
      id: `tasks:${t.id}`,
      source: "tasks",
      part: "automate",
      entityType: "task",
      entityId: t.id,
      name: t.title,
      url: `/tasks?taskId=${t.id}`,
      dueDate: t.due_date,
      waitingSince: toIso(t.created_at),
      overdue: t.due_date !== null && t.due_date < ctx.today,
      meta: { status: t.status, priority: t.priority },
    }));
  },
};
