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

/**
 * Deadline escalation (F9) — plain range scans, deliberately NOT deduped here.
 *
 * Each row notifies several people (owner + every admin), so a filter in the
 * row query could only ask "has *anyone* been told about this risk?" — the
 * wrong question twice over (downgrades the guarantee from per-recipient to
 * per-entity, and fights the per-recipient try/catch: one admin's write throws
 * and is logged-and-continued, and a row-level filter then excludes the entity
 * forever). See the F9 design §4.1. The service calls hasDeadlineNoticeQuery
 * once per recipient, immediately before that recipient's write.
 *
 * Range, not exact-day equality: a missed run catches up the next night
 * instead of dropping the notice forever. Overdue rows are included on
 * purpose — more urgent, not less, and the per-recipient dedup makes it safe.
 */
export interface DeadlineEscalationRow {
  entity_id: number;
  entity_name: string;
  deadline: Date;
  owner_id: number | null; // risks.risk_owner OR model_risks.owner (aliased)
  model_id?: number | null; // model leg only, for the action_url
}

export async function getRisksApproachingDeadlineQuery(
  organizationId: number,
  thresholdDays: number,
): Promise<DeadlineEscalationRow[]> {
  const rows = (await sequelize.query(
    `SELECT id AS entity_id,
            risk_name AS entity_name,
            deadline,
            risk_owner AS owner_id
       FROM risks
      WHERE organization_id = :organizationId
        AND is_deleted = false
        AND deadline IS NOT NULL
        AND deadline <= NOW() + (:thresholdDays || ' days')::interval
      ORDER BY id ASC`,
    {
      replacements: { organizationId, thresholdDays },
      type: QueryTypes.SELECT,
    },
  )) as any[];
  return rows.map((row) => ({
    entity_id: row.entity_id,
    entity_name: row.entity_name,
    deadline: new Date(row.deadline),
    owner_id: row.owner_id ?? null,
  }));
}

export async function getModelRisksApproachingTargetDateQuery(
  organizationId: number,
  thresholdDays: number,
): Promise<DeadlineEscalationRow[]> {
  const rows = (await sequelize.query(
    `SELECT id AS entity_id,
            risk_name AS entity_name,
            target_date AS deadline,
            owner AS owner_id,
            model_id
       FROM model_risks
      WHERE organization_id = :organizationId
        AND is_deleted = false
        AND target_date IS NOT NULL
        -- model_risks.target_date is timestamp WITHOUT time zone, unlike
        -- risks.deadline which is timestamptz. Comparing a naive column to
        -- NOW() (timestamptz) resolves through the SESSION TimeZone, so the
        -- same row matches or not depending on who is connected -- the app
        -- runs UTC, a psql session here runs Europe/Istanbul, and the 3h gap
        -- silently pushed a row exactly 7 days out past the boundary.
        -- The app writes this column as naive UTC, so anchor to naive UTC.
        AND target_date <= (NOW() AT TIME ZONE 'UTC') + (:thresholdDays || ' days')::interval
      ORDER BY id ASC`,
    {
      replacements: { organizationId, thresholdDays },
      type: QueryTypes.SELECT,
    },
  )) as any[];
  return rows.map((row) => ({
    entity_id: row.entity_id,
    entity_name: row.entity_name,
    deadline: new Date(row.deadline),
    owner_id: row.owner_id ?? null,
    model_id: row.model_id ?? null,
  }));
}

/**
 * Per-recipient sent-record for the deadline sweep: has THIS user already got
 * THIS notice (type + entity + threshold)? The `threshold_days` clause is what
 * lets the 7-day and 1-day notices coexist on the same risk — without it the
 * 1-day notice would never fire. A write that fails leaves no record, so the
 * next night retries exactly that recipient.
 */
export async function hasDeadlineNoticeQuery(
  organizationId: number,
  userId: number,
  notificationType: string,
  entityType: string,
  entityId: number,
  thresholdDays: number,
): Promise<boolean> {
  const rows = (await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM notifications
        WHERE organization_id = :organizationId
          AND user_id = :userId
          AND type = :notificationType
          AND entity_type = :entityType
          AND entity_id = :entityId
          AND metadata->>'threshold_days' = :thresholdDays::text
     ) AS notified`,
    {
      replacements: {
        organizationId,
        userId,
        notificationType,
        entityType,
        entityId,
        thresholdDays,
      },
      type: QueryTypes.SELECT,
    },
  )) as { notified: boolean }[];
  return rows[0]?.notified === true;
}

/** Org admin user ids (role_id = 1) — the deadline sweep notifies all of them. */
export async function getDeadlineAdminIdsQuery(organizationId: number): Promise<number[]> {
  const rows = (await sequelize.query(
    `SELECT id FROM users WHERE organization_id = :organizationId AND role_id = 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return rows.map((row) => Number(row.id));
}
