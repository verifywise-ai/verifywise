/**
 * @file deadline.utils.ts
 * @description Aggregate queries powering the deadline warning banner.
 *
 * The "overdue" / "due soon" predicates mirror the logic encoded in
 * Task.isOverdue() (domain.layer/models/tasks/tasks.model.ts) so a task
 * counted here is exactly one that would return true from the model method:
 *   - due_date IS NOT NULL
 *   - status NOT IN ('Completed', 'Deleted')
 *   - due_date < CURRENT_DATE                                (overdue)
 *   - due_date BETWEEN today and today + N days              (due soon)
 *
 * Visibility rules match getTasksQuery in task.utils.ts: Admin/SuperAdmin
 * see every org task; everyone else sees only tasks they created or are
 * assignees of.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";

export interface TasksDeadlineSummaryOptions {
  userId: number;
  role: string;
  organizationId: number;
  /** Days from today to flag as "due soon". Clamped to [1, 365]. Defaults to 14. */
  threshold?: number;
}

export interface TasksDeadlineSummary {
  overdue: number;
  dueSoon: number;
  threshold: number;
}

export const DEFAULT_DEADLINE_THRESHOLD_DAYS = 14;
const MIN_THRESHOLD_DAYS = 1;
const MAX_THRESHOLD_DAYS = 365;

export function clampDeadlineThreshold(raw: number | undefined): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DEADLINE_THRESHOLD_DAYS;
  return Math.min(MAX_THRESHOLD_DAYS, Math.max(MIN_THRESHOLD_DAYS, n));
}

/**
 * Count overdue and due-soon tasks visible to the caller, in a single
 * round-trip using PostgreSQL's `COUNT(*) FILTER (WHERE …)`.
 */
export async function getTasksDeadlineSummaryQuery({
  userId,
  role,
  organizationId,
  threshold,
}: TasksDeadlineSummaryOptions): Promise<TasksDeadlineSummary> {
  const days = clampDeadlineThreshold(threshold);
  const isAdmin = role === "Admin" || role === "SuperAdmin";

  // Non-admins only see tasks they created or are assignees of — mirrors the
  // addVisibilityLogic helper in task.utils.ts.
  const visibilityJoin = isAdmin
    ? ""
    : `LEFT JOIN task_assignees ta
         ON ta.task_id = t.id
        AND ta.organization_id = :organizationId
        AND ta.user_id = :userId`;
  const visibilityWhere = isAdmin ? "" : `AND (t.creator_id = :userId OR ta.user_id IS NOT NULL)`;

  const query = `
    SELECT
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.due_date IS NOT NULL
          AND t.due_date < CURRENT_DATE
      ) AS overdue,
      COUNT(DISTINCT t.id) FILTER (
        WHERE t.due_date IS NOT NULL
          AND t.due_date >= CURRENT_DATE
          AND t.due_date <= CURRENT_DATE + (:days || ' days')::INTERVAL
      ) AS due_soon
    FROM tasks t
    ${visibilityJoin}
    WHERE t.organization_id = :organizationId
      AND t.status NOT IN (:completedStatus, :deletedStatus)
      ${visibilityWhere}`;

  const result = (await sequelize.query(query, {
    replacements: {
      organizationId,
      userId,
      days,
      completedStatus: TaskStatus.COMPLETED,
      deletedStatus: TaskStatus.DELETED,
    },
    type: QueryTypes.SELECT,
  })) as Array<{ overdue: string | number; due_soon: string | number }>;

  const row = result[0];
  return {
    overdue: row ? Number(row.overdue) : 0,
    dueSoon: row ? Number(row.due_soon) : 0,
    threshold: days,
  };
}
