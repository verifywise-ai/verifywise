/**
 * Deadline summary aggregations.
 *
 * Returns counts of overdue and "due soon" tasks for an organization,
 * scoped to what the requesting user is allowed to see (Admin / SuperAdmin
 * see all org tasks; everyone else sees tasks they created or are assigned to).
 *
 * The overdue / not-overdue predicate mirrors the in-model
 * {@link ../domain.layer/models/tasks/tasks.model.ts | TasksModel#isOverdue}:
 * `due_date` is set and `status NOT IN ('Completed', 'Deleted')`.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";

export const DEFAULT_DUE_SOON_THRESHOLD_DAYS = 14;

export interface TaskDeadlineCounts {
  overdue: number;
  dueSoon: number;
  threshold: number;
}

export interface TaskDeadlineQueryOptions {
  userId: number;
  /** Role name as set by auth middleware (e.g. "Admin", "Reviewer", "SuperAdmin") */
  role: string;
  organizationId: number;
  thresholdDays?: number;
}

/**
 * Predicate for whether a task is in scope for the deadline summary:
 *  - status is neither Completed nor Deleted
 *  - due_date is not NULL
 *
 * Kept as a string fragment so callers compose it into the larger queries.
 */
const TASK_ACTIVE_PREDICATE = `
  status NOT IN (:completedStatus, :deletedStatus)
  AND due_date IS NOT NULL
  AND organization_id = :organizationId
`;

/**
 * Returns the visibility-restriction SQL fragment for non-admin roles:
 * a task is visible if the requesting user created it or is in task_assignees.
 * Returns `""` for Admin / SuperAdmin (org-wide visibility).
 */
function buildVisibilityClause(role: string): string {
  if (role === "Admin" || role === "SuperAdmin") return "";
  return `
    AND (
      creator_id = :userId
      OR EXISTS (
        SELECT 1 FROM task_assignees ta
        WHERE ta.task_id = tasks.id
          AND ta.organization_id = :organizationId
          AND ta.user_id = :userId
      )
    )
  `;
}

/**
 * Returns overdue / due-soon task counts for the given user.
 *
 *  - overdue:  due_date < CURRENT_DATE, status is active.
 *  - dueSoon:  CURRENT_DATE <= due_date <= CURRENT_DATE + thresholdDays.
 *  - threshold: the threshold used (echoed back so callers can render it).
 */
export const getTaskDeadlineSummaryQuery = async (
  options: TaskDeadlineQueryOptions,
): Promise<TaskDeadlineCounts> => {
  const { userId, role, organizationId } = options;
  const threshold = options.thresholdDays ?? DEFAULT_DUE_SOON_THRESHOLD_DAYS;

  const visibility = buildVisibilityClause(role);

  const replacements = {
    organizationId,
    userId,
    threshold,
    completedStatus: TaskStatus.COMPLETED,
    deletedStatus: TaskStatus.DELETED,
  };

  const [overdueRow] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count
     FROM tasks
     WHERE ${TASK_ACTIVE_PREDICATE}
       AND due_date < CURRENT_DATE
       ${visibility}`,
    { replacements, type: QueryTypes.SELECT },
  )) as Array<{ count: number }>;

  const [dueSoonRow] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count
     FROM tasks
     WHERE ${TASK_ACTIVE_PREDICATE}
       AND due_date >= CURRENT_DATE
       AND due_date <= CURRENT_DATE + (:threshold || ' days')::INTERVAL
       ${visibility}`,
    { replacements, type: QueryTypes.SELECT },
  )) as Array<{ count: number }>;

  return {
    overdue: Number(overdueRow?.count ?? 0),
    dueSoon: Number(dueSoonRow?.count ?? 0),
    threshold,
  };
};
