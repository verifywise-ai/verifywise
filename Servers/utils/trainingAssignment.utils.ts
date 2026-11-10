/**
 * Training assignments (#5260): who has to complete a training, and by when.
 *
 * Every query is scoped by organization_id. A person is "in the organization"
 * when they have an organization_members row (users can belong to several
 * organizations), so reads and the reminder sweep join on it: someone who left
 * stops appearing and stops being reminded, and their row comes back unchanged
 * if they return.
 *
 * Writes are single statements on purpose. With RLS enforced, each request's
 * queries already run in one org-scoped transaction, and a separate
 * sequelize.transaction() would run outside that scope.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";

export type TrainingAssignmentStatus = "pending" | "overdue" | "completed";
export type TrainingReminderKind = "due_soon" | "overdue";

export interface TrainingAssignment {
  id: number;
  training_id: number;
  user_id: number;
  user_name: string;
  user_surname: string;
  due_date: string;
  status: TrainingAssignmentStatus;
  completed_at: string | null;
  completed_by: number | null;
  assigned_by: number | null;
  created_at: string;
}

export interface MyTrainingAssignment extends TrainingAssignment {
  training_name: string;
  training_duration: string | null;
  training_provider: string | null;
  training_description: string | null;
}

export interface TrainingAssignmentSummary {
  training_id: number;
  total: number;
  completed: number;
  overdue: number;
}

export interface AssignableTraining {
  id: number;
  training_name: string;
  duration: string | null;
  description: string | null;
}

export interface TrainingReminderDue {
  id: number;
  user_id: number;
  training_id: number;
  training_name: string;
  due_date: string;
  kind: TrainingReminderKind;
}

/** Days before the due date in which an open assignment counts as due soon. */
export const DUE_SOON_DAYS = 7;

const REMINDER_COLUMNS: Record<TrainingReminderKind, string> = {
  due_soon: "due_soon_reminded_at",
  overdue: "overdue_reminded_at",
};

type AssignmentRow = Omit<TrainingAssignment, "status"> & { today: string };

const IS_ORG_MEMBER = `EXISTS (
  SELECT 1 FROM organization_members om
   WHERE om.organization_id = ta.organization_id AND om.user_id = ta.user_id
)`;

const ASSIGNMENT_COLUMNS = `
  ta.id, ta.training_id, ta.user_id,
  u.name AS user_name, u.surname AS user_surname,
  to_char(ta.due_date, 'YYYY-MM-DD') AS due_date,
  ta.completed_at, ta.completed_by, ta.assigned_by, ta.created_at,
  to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`;

const ASSIGNMENT_SOURCE = `
  training_assignments ta
  JOIN users u ON u.id = ta.user_id`;

const OPEN_FIRST_BY_DUE_DATE = `ORDER BY (ta.completed_at IS NOT NULL), ta.due_date, ta.id`;

/** Dates are compared as "YYYY-MM-DD" strings, using the database's today. */
export function deriveAssignmentStatus(
  completedAt: unknown,
  dueDate: string,
  today: string,
): TrainingAssignmentStatus {
  if (completedAt) return "completed";
  return dueDate < today ? "overdue" : "pending";
}

function toAssignment<T extends AssignmentRow>({
  today,
  ...row
}: T): Omit<T, "today"> & { status: TrainingAssignmentStatus } {
  return { ...row, status: deriveAssignmentStatus(row.completed_at, row.due_date, today) };
}

async function selectRows<T extends object>(
  sql: string,
  replacements: Record<string, unknown>,
): Promise<T[]> {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
}

async function writeReturningIds<T extends object>(
  sql: string,
  replacements: Record<string, unknown>,
): Promise<T[]> {
  const [rows] = await sequelize.query(sql, { replacements });
  return rows as T[];
}

export async function getAssignableTrainingQuery(
  trainingId: number,
  organizationId: number,
): Promise<AssignableTraining | null> {
  const rows = await selectRows<AssignableTraining>(
    `SELECT id, training_name, duration, description
       FROM trainingregistar
      WHERE organization_id = :organizationId AND id = :trainingId`,
    { organizationId, trainingId },
  );
  return rows[0] ?? null;
}

export async function getTrainingAssignmentsQuery(
  trainingId: number,
  organizationId: number,
): Promise<TrainingAssignment[]> {
  const rows = await selectRows<AssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM ${ASSIGNMENT_SOURCE}
      WHERE ta.organization_id = :organizationId
        AND ta.training_id = :trainingId
        AND ${IS_ORG_MEMBER}
      ${OPEN_FIRST_BY_DUE_DATE}`,
    { organizationId, trainingId },
  );
  return rows.map(toAssignment);
}

export async function getMyTrainingAssignmentsQuery(
  userId: number,
  organizationId: number,
): Promise<MyTrainingAssignment[]> {
  const rows = await selectRows<
    AssignmentRow &
      Pick<
        MyTrainingAssignment,
        "training_name" | "training_duration" | "training_provider" | "training_description"
      >
  >(
    `SELECT ${ASSIGNMENT_COLUMNS},
            t.training_name,
            t.duration AS training_duration,
            t.provider AS training_provider,
            t.description AS training_description
       FROM ${ASSIGNMENT_SOURCE}
       JOIN trainingregistar t
         ON t.id = ta.training_id AND t.organization_id = ta.organization_id
      WHERE ta.organization_id = :organizationId
        AND ta.user_id = :userId
      ${OPEN_FIRST_BY_DUE_DATE}`,
    { organizationId, userId },
  );
  return rows.map(toAssignment);
}

export async function getTrainingAssignmentSummaryQuery(
  organizationId: number,
): Promise<TrainingAssignmentSummary[]> {
  return selectRows<TrainingAssignmentSummary>(
    `SELECT ta.training_id,
            COUNT(*)::int AS total,
            (COUNT(*) FILTER (WHERE ta.completed_at IS NOT NULL))::int AS completed,
            (COUNT(*) FILTER (WHERE ta.completed_at IS NULL AND ta.due_date < CURRENT_DATE))::int AS overdue
       FROM training_assignments ta
      WHERE ta.organization_id = :organizationId
        AND ${IS_ORG_MEMBER}
      GROUP BY ta.training_id
      ORDER BY ta.training_id`,
    { organizationId },
  );
}

/** Those of the given users who are not members of this organization. */
export async function getNonMemberUserIdsQuery(
  userIds: number[],
  organizationId: number,
): Promise<number[]> {
  const rows = await selectRows<{ user_id: number }>(
    `SELECT user_id FROM organization_members
      WHERE organization_id = :organizationId AND user_id IN (:userIds)`,
    { organizationId, userIds },
  );
  const members = new Set(rows.map((row) => row.user_id));
  return userIds.filter((userId) => !members.has(userId));
}

/**
 * Assign a training. People who already have a row keep it and their due date,
 * and are reported back as skipped. A due date within the due-soon window has
 * already been announced by the assignment itself, so it is marked reminded.
 */
export async function createTrainingAssignmentsQuery(
  input: { trainingId: number; userIds: number[]; dueDate: string; assignedBy: number },
  organizationId: number,
): Promise<{ created: TrainingAssignment[]; skippedUserIds: number[] }> {
  const inserted = await writeReturningIds<{ id: number; user_id: number }>(
    `INSERT INTO training_assignments
       (organization_id, training_id, user_id, due_date, assigned_by, due_soon_reminded_at)
     SELECT :organizationId, :trainingId, assignee.user_id, CAST(:dueDate AS DATE), :assignedBy,
            CASE WHEN CAST(:dueDate AS DATE) <= CURRENT_DATE + ${DUE_SOON_DAYS} THEN now() END
       FROM unnest(CAST(ARRAY[:userIds] AS int[])) AS assignee(user_id)
     ON CONFLICT (training_id, user_id) DO NOTHING
     RETURNING id, user_id`,
    { organizationId, ...input },
  );

  const createdUserIds = new Set(inserted.map((row) => row.user_id));
  const skippedUserIds = input.userIds.filter((userId) => !createdUserIds.has(userId));
  if (inserted.length === 0) return { created: [], skippedUserIds };

  const rows = await selectRows<AssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM ${ASSIGNMENT_SOURCE}
      WHERE ta.organization_id = :organizationId AND ta.id IN (:ids)
      ORDER BY ta.id`,
    { organizationId, ids: inserted.map((row) => row.id) },
  );
  return { created: rows.map(toAssignment), skippedUserIds };
}

export async function getTrainingAssignmentByIdQuery(
  id: number,
  organizationId: number,
): Promise<TrainingAssignment | null> {
  const rows = await selectRows<AssignmentRow>(
    `SELECT ${ASSIGNMENT_COLUMNS}
       FROM ${ASSIGNMENT_SOURCE}
      WHERE ta.organization_id = :organizationId AND ta.id = :id
        AND ${IS_ORG_MEMBER}`,
    { organizationId, id },
  );
  return rows[0] ? toAssignment(rows[0]) : null;
}

/**
 * Change a due date. A real change restarts the reminders: the old notices were
 * about a date that no longer applies, and nothing else tells the assignee.
 */
export async function updateTrainingAssignmentDueDateQuery(
  id: number,
  dueDate: string,
  organizationId: number,
): Promise<void> {
  const newDate = "CAST(:dueDate AS DATE)";
  await sequelize.query(
    `UPDATE training_assignments
        SET due_soon_reminded_at = CASE
              WHEN due_date = ${newDate} THEN due_soon_reminded_at
              ELSE NULL
            END,
            overdue_reminded_at = CASE
              WHEN due_date = ${newDate} THEN overdue_reminded_at
              ELSE NULL
            END,
            due_date = ${newDate},
            updated_at = now()
      WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id, dueDate } },
  );
}

/**
 * Idempotent: a finished assignment keeps its first completed_at/completed_by.
 * Returns whether this call completed it, so a concurrent call records nothing.
 */
export async function completeTrainingAssignmentQuery(
  id: number,
  completedBy: number,
  organizationId: number,
): Promise<boolean> {
  const rows = await writeReturningIds<{ id: number }>(
    `UPDATE training_assignments
        SET completed_at = now(), completed_by = :completedBy, updated_at = now()
      WHERE organization_id = :organizationId AND id = :id AND completed_at IS NULL
      RETURNING id`,
    { organizationId, id, completedBy },
  );
  return rows.length > 0;
}

/**
 * Only current members' rows count, matching what the assignment list shows.
 * Returns who was completed, for the training's change history.
 */
export async function completeAllTrainingAssignmentsQuery(
  trainingId: number,
  completedBy: number,
  organizationId: number,
): Promise<Array<{ name: string; surname: string; due_date: string }>> {
  return writeReturningIds<{ name: string; surname: string; due_date: string }>(
    `UPDATE training_assignments ta
        SET completed_at = now(), completed_by = :completedBy, updated_at = now()
       FROM users u
      WHERE u.id = ta.user_id
        AND ta.organization_id = :organizationId
        AND ta.training_id = :trainingId
        AND ta.completed_at IS NULL
        AND ${IS_ORG_MEMBER}
      RETURNING u.name, u.surname, to_char(ta.due_date, 'YYYY-MM-DD') AS due_date`,
    { organizationId, trainingId, completedBy },
  );
}

/** Returns whether this call reopened it, so a concurrent call records nothing. */
export async function reopenTrainingAssignmentQuery(
  id: number,
  organizationId: number,
): Promise<boolean> {
  const rows = await writeReturningIds<{ id: number }>(
    `UPDATE training_assignments
        SET completed_at = NULL, completed_by = NULL,
            due_soon_reminded_at = NULL, overdue_reminded_at = NULL, updated_at = now()
      WHERE organization_id = :organizationId AND id = :id AND completed_at IS NOT NULL
      RETURNING id`,
    { organizationId, id },
  );
  return rows.length > 0;
}

export async function deleteTrainingAssignmentQuery(
  id: number,
  organizationId: number,
): Promise<void> {
  await sequelize.query(
    `DELETE FROM training_assignments WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id } },
  );
}

export async function getUserFullNameQuery(userId: number): Promise<string | null> {
  const rows = await selectRows<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { userId },
  );
  return rows[0] ? `${rows[0].name} ${rows[0].surname}`.trim() : null;
}

/** Open assignments of current members that have a reminder waiting. */
export async function findTrainingRemindersDueQuery(
  organizationId: number,
): Promise<TrainingReminderDue[]> {
  return selectRows<TrainingReminderDue>(
    `SELECT ta.id, ta.user_id, ta.training_id, t.training_name,
            to_char(ta.due_date, 'YYYY-MM-DD') AS due_date,
            CASE WHEN ta.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due_soon' END AS kind
       FROM training_assignments ta
       JOIN trainingregistar t
         ON t.id = ta.training_id AND t.organization_id = ta.organization_id
      WHERE ta.organization_id = :organizationId
        AND ta.completed_at IS NULL
        AND ${IS_ORG_MEMBER}
        AND (
          (ta.due_date < CURRENT_DATE AND ta.overdue_reminded_at IS NULL)
          OR (
            ta.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ${DUE_SOON_DAYS}
            AND ta.due_soon_reminded_at IS NULL
          )
        )
      ORDER BY ta.id`,
    { organizationId },
  );
}

export async function markTrainingReminderSentQuery(
  id: number,
  kind: TrainingReminderKind,
  organizationId: number,
): Promise<void> {
  await sequelize.query(
    `UPDATE training_assignments
        SET ${REMINDER_COLUMNS[kind]} = now()
      WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id } },
  );
}
