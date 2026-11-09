import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "../domain.layer/exceptions/custom.exception";

// ---------- Types ----------

export type TrainingAssignmentSubjectType = "user" | "group";
export type TrainingAssignmentStatus = "pending" | "completed" | "overdue";

export interface ITrainingAssignment {
  id: number;
  organization_id: number;
  training_id: number;
  subject_type: TrainingAssignmentSubjectType;
  subject_id: number;
  due_date: Date | null;
  status: TrainingAssignmentStatus;
  completed_at: Date | null;
  last_reminded_at: Date | null;
  assigned_by: number | null;
  assigned_at: Date;
  created_at: Date;
  updated_at: Date;
}

/** One bulk-create input. Group subjects are stored as a group row and
 * resolved to members at reminder time. */
export interface ICreateTrainingAssignmentInput {
  trainingId: number;
  subjectType: TrainingAssignmentSubjectType;
  subjectId: number;
  dueDate?: string | Date | null;
}

export interface ITrainingAssignmentCreateError {
  index: number;
  message: string;
}

export interface ICreateTrainingAssignmentsResult {
  created: ITrainingAssignment[];
  errors: ITrainingAssignmentCreateError[];
}

export interface ITrainingAssignmentFilters {
  trainingId?: number;
  status?: TrainingAssignmentStatus;
}

/** A flattened reminder recipient: one row per (assignment, user). */
export interface ITrainingAssignmentRecipient {
  assignment_id: number;
  user_id: number;
  assigned_by: number | null;
  training_id: number;
  training_name: string;
  training_description: string | null;
  training_duration: string | null;
  due_date: Date | null;
  status: TrainingAssignmentStatus;
}

// ---------- Internal validators ----------

const assertPositiveInt = (n: unknown, name: string): number => {
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new ValidationException(`${name} must be a positive integer`, name, n);
  }
  return n;
};

const SUBJECT_TYPES: ReadonlySet<TrainingAssignmentSubjectType> = new Set(["user", "group"]);
const STATUSES: ReadonlySet<TrainingAssignmentStatus> = new Set([
  "pending",
  "completed",
  "overdue",
]);

const assertSubjectType = (v: unknown): TrainingAssignmentSubjectType => {
  if (typeof v !== "string" || !SUBJECT_TYPES.has(v as TrainingAssignmentSubjectType)) {
    throw new ValidationException("subject_type must be 'user' or 'group'", "subject_type", v);
  }
  return v as TrainingAssignmentSubjectType;
};

const assertStatus = (v: unknown): TrainingAssignmentStatus => {
  if (typeof v !== "string" || !STATUSES.has(v as TrainingAssignmentStatus)) {
    throw new ValidationException("status must be one of pending, completed, overdue", "status", v);
  }
  return v as TrainingAssignmentStatus;
};

const normalizeDueDate = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) {
    throw new ValidationException("due_date must be a valid date", "due_date", raw);
  }
  return date.toISOString();
};

/** The training must belong to the org before we hang an assignment on it. */
const assertTrainingBelongsToOrg = async (
  trainingId: number,
  organizationId: number,
): Promise<void> => {
  const rows = await sequelize.query(
    `SELECT 1 AS ok FROM trainingregistar
       WHERE id = :trainingId AND organization_id = :organizationId
       LIMIT 1`,
    {
      replacements: { trainingId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  if (rows.length === 0) {
    throw new ForbiddenException(
      "Training not found in this organization",
      "training",
      String(trainingId),
    );
  }
};

const assertUserBelongsToOrg = async (userId: number, organizationId: number): Promise<void> => {
  const rows = await sequelize.query(
    `SELECT 1 AS ok FROM organization_members
       WHERE user_id = :userId AND organization_id = :organizationId
       LIMIT 1`,
    {
      replacements: { userId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  if (rows.length === 0) {
    throw new ForbiddenException("User not found in this organization", "user", String(userId));
  }
};

const assertGroupBelongsToOrg = async (groupId: number, organizationId: number): Promise<void> => {
  const rows = await sequelize.query(
    `SELECT 1 AS ok FROM groups
       WHERE id = :groupId AND organization_id = :organizationId
       LIMIT 1`,
    {
      replacements: { groupId, organizationId },
      type: QueryTypes.SELECT,
    },
  );
  if (rows.length === 0) {
    throw new ForbiddenException("Group not found in this organization", "group", String(groupId));
  }
};

// ---------- Public: queries ----------

export const listAssignmentsQuery = async (
  organizationId: number,
  filters: ITrainingAssignmentFilters = {},
): Promise<ITrainingAssignment[]> => {
  assertPositiveInt(organizationId, "organizationId");
  const conditions = ["organization_id = :organizationId"];
  const replacements: Record<string, unknown> = { organizationId };

  if (filters.trainingId !== undefined) {
    conditions.push("training_id = :trainingId");
    replacements.trainingId = assertPositiveInt(filters.trainingId, "training_id");
  }
  if (filters.status !== undefined) {
    conditions.push("status = :status");
    replacements.status = assertStatus(filters.status);
  }

  return (await sequelize.query(
    `SELECT * FROM training_assignments
       WHERE ${conditions.join(" AND ")}
       ORDER BY assigned_at ASC, id ASC`,
    { replacements, type: QueryTypes.SELECT },
  )) as ITrainingAssignment[];
};

/**
 * Bulk-create assignments. Each input is validated independently; an
 * invalid or duplicate input becomes an error entry instead of aborting
 * the whole batch. Duplicates are detected through the UNIQUE
 * (organization_id, training_id, subject_type, subject_id) constraint
 * (Postgres 23505) and reported as conflicts.
 */
export const createAssignmentsQuery = async (
  inputs: ICreateTrainingAssignmentInput[],
  organizationId: number,
  assignedBy: number | null,
): Promise<ICreateTrainingAssignmentsResult> => {
  assertPositiveInt(organizationId, "organizationId");
  if (assignedBy !== null) assertPositiveInt(assignedBy, "assignedBy");
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new ValidationException("assignments must be a non-empty array", "assignments");
  }

  const created: ITrainingAssignment[] = [];
  const errors: ITrainingAssignmentCreateError[] = [];

  // A training id is validated once — it cannot differ per row in a way
  // that matters once the first check passes, but rows are independent.
  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index] ?? ({} as ICreateTrainingAssignmentInput);
    try {
      const trainingId = assertPositiveInt(input.trainingId, "training_id");
      const subjectType = assertSubjectType(input.subjectType);
      const subjectId = assertPositiveInt(input.subjectId, "subject_id");
      const dueDate = normalizeDueDate(input.dueDate);

      await assertTrainingBelongsToOrg(trainingId, organizationId);
      if (subjectType === "user") {
        await assertUserBelongsToOrg(subjectId, organizationId);
      } else {
        await assertGroupBelongsToOrg(subjectId, organizationId);
      }

      const rows = (await sequelize.query(
        `INSERT INTO training_assignments (
           organization_id, training_id, subject_type, subject_id,
           due_date, assigned_by
         ) VALUES (
           :organizationId, :trainingId, :subjectType, :subjectId,
           :dueDate, :assignedBy
         )
         RETURNING *`,
        {
          replacements: { organizationId, trainingId, subjectType, subjectId, dueDate, assignedBy },
          type: QueryTypes.SELECT,
        },
      )) as ITrainingAssignment[];
      created.push(rows[0]);
    } catch (err: any) {
      if (err?.original?.code === "23505" || err?.code === "23505") {
        errors.push({
          index,
          message: `Assignment already exists for subject ${input.subjectType} ${input.subjectId} on training ${input.trainingId}`,
        });
        continue;
      }
      if (
        err instanceof ValidationException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException ||
        err instanceof ConflictException
      ) {
        errors.push({ index, message: err.message });
        continue;
      }
      throw err;
    }
  }

  return { created, errors };
};

/**
 * Mark one assignment completed. Idempotent: an already-completed row is
 * returned unchanged instead of raising.
 */
export const completeAssignmentQuery = async (
  id: number,
  organizationId: number,
): Promise<ITrainingAssignment> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  const rows = (await sequelize.query(
    `UPDATE training_assignments
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
      WHERE id = :id AND organization_id = :organizationId
      RETURNING *`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  )) as ITrainingAssignment[];

  if (rows.length === 0) {
    throw new NotFoundException("Training assignment not found", "training_assignment", id);
  }
  return rows[0];
};

/** Complete every pending assignment for a training (used when the
 * training itself is marked Completed). Returns how many were flipped. */
export const completeAllPendingAssignmentsForTrainingQuery = async (
  trainingId: number,
  organizationId: number,
): Promise<number> => {
  assertPositiveInt(trainingId, "training_id");
  assertPositiveInt(organizationId, "organizationId");

  const rows = (await sequelize.query(
    `UPDATE training_assignments
        SET status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
      WHERE training_id = :trainingId
        AND organization_id = :organizationId
        AND status IN ('pending', 'overdue')
      RETURNING id`,
    { replacements: { trainingId, organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows.length;
};

export const deleteAssignmentQuery = async (
  id: number,
  organizationId: number,
): Promise<boolean> => {
  assertPositiveInt(id, "id");
  assertPositiveInt(organizationId, "organizationId");

  const rows = await sequelize.query(
    `DELETE FROM training_assignments
       WHERE id = :id AND organization_id = :organizationId
       RETURNING id`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
};

/** Members of a group in this org — empty when the group has none. */
export const resolveGroupMembersQuery = async (
  groupId: number,
  organizationId: number,
): Promise<Array<{ id: number; name: string; surname: string; email: string }>> => {
  assertPositiveInt(groupId, "group_id");
  assertPositiveInt(organizationId, "organizationId");

  return (await sequelize.query(
    `SELECT u.id, u.name, u.surname, u.email
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = :groupId
        AND gm.organization_id = :organizationId
      ORDER BY u.name ASC, u.id ASC`,
    { replacements: { groupId, organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; name: string; surname: string; email: string }>;
};

/** Pending/completed/overdue counts for one training (or the whole org). */
export const statsForTrainingQuery = async (
  organizationId: number,
  trainingId?: number,
): Promise<{
  training_id: number | null;
  pending: number;
  completed: number;
  overdue: number;
  total: number;
}> => {
  assertPositiveInt(organizationId, "organizationId");
  const replacements: Record<string, unknown> = { organizationId };
  let trainingFilter = "";
  if (trainingId !== undefined) {
    replacements.trainingId = assertPositiveInt(trainingId, "training_id");
    trainingFilter = "AND training_id = :trainingId";
  }

  const rows = (await sequelize.query(
    `SELECT training_id, status, COUNT(*)::int AS count
       FROM training_assignments
      WHERE organization_id = :organizationId ${trainingFilter}
      GROUP BY training_id, status`,
    { replacements, type: QueryTypes.SELECT },
  )) as Array<{ training_id: number; status: TrainingAssignmentStatus; count: number }>;

  const summary = {
    training_id: trainingId ?? null,
    pending: 0,
    completed: 0,
    overdue: 0,
    total: 0,
  };
  for (const row of rows) {
    summary[row.status] += row.count;
    summary.total += row.count;
  }
  return summary;
};

// ---------- Public: reminder sweep ----------

/**
 * Flip pending assignments whose due date has passed to overdue.
 * Returns the ids that changed so the sweep can log them.
 */
export const computeOverdueAssignmentsQuery = async (organizationId: number): Promise<number[]> => {
  assertPositiveInt(organizationId, "organizationId");

  const rows = (await sequelize.query(
    `UPDATE training_assignments
        SET status = 'overdue',
            updated_at = NOW()
      WHERE organization_id = :organizationId
        AND status = 'pending'
        AND due_date IS NOT NULL
        AND due_date < NOW()
      RETURNING id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number }>;
  return rows.map((r) => r.id);
};

/**
 * Reminder candidates, flattened to one row per recipient user: user
 * assignments resolve directly; group assignments resolve through
 * group_members (a group with no members yields no rows — the caller
 * logs that as a skipped entry). A user who is a member of two groups
 * assigned the same training appears once per assignment but the sweep
 * dedupes by (user_id, training_id) before sending.
 */
export const assignmentsDueForReminderQuery = async (
  organizationId: number,
): Promise<ITrainingAssignmentRecipient[]> => {
  assertPositiveInt(organizationId, "organizationId");

  return (await sequelize.query(
    `SELECT a.id AS assignment_id,
            u.id AS user_id,
            a.training_id,
            t.training_name,
            t.description AS training_description,
            t.duration AS training_duration,
            a.due_date,
            a.status
       FROM training_assignments a
       JOIN trainingregistar t
         ON t.id = a.training_id
        AND t.organization_id = a.organization_id
       JOIN users u
         ON u.id = CASE WHEN a.subject_type = 'user' THEN a.subject_id END
      WHERE a.organization_id = :organizationId
        AND a.status IN ('pending', 'overdue')
        AND (a.due_date IS NULL OR a.due_date < NOW() + INTERVAL '7 days')
        AND (a.last_reminded_at IS NULL OR a.last_reminded_at < NOW() - INTERVAL '3 days')

      UNION

     SELECT a.id AS assignment_id,
            u.id AS user_id,
            a.assigned_by,
            a.training_id,
            t.training_name,
            t.description AS training_description,
            t.duration AS training_duration,
            a.due_date,
            a.status
       FROM training_assignments a
       JOIN trainingregistar t
         ON t.id = a.training_id
        AND t.organization_id = a.organization_id
       JOIN group_members gm
         ON gm.group_id = a.subject_id
        AND gm.organization_id = a.organization_id
       JOIN users u ON u.id = gm.user_id
      WHERE a.organization_id = :organizationId
        AND a.subject_type = 'group'
        AND a.status IN ('pending', 'overdue')
        AND (a.due_date IS NULL OR a.due_date < NOW() + INTERVAL '7 days')
        AND (a.last_reminded_at IS NULL OR a.last_reminded_at < NOW() - INTERVAL '3 days')
      ORDER BY assignment_id, user_id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as ITrainingAssignmentRecipient[];
};

/** Group-subject candidates whose group has no members — logged as skips. */
export const emptyGroupAssignmentsQuery = async (
  organizationId: number,
): Promise<Array<{ assignment_id: number; training_id: number; subject_id: number }>> => {
  assertPositiveInt(organizationId, "organizationId");

  return (await sequelize.query(
    `SELECT a.id AS assignment_id, a.training_id, a.subject_id
       FROM training_assignments a
      WHERE a.organization_id = :organizationId
        AND a.subject_type = 'group'
        AND a.status IN ('pending', 'overdue')
        AND (a.due_date IS NULL OR a.due_date < NOW() + INTERVAL '7 days')
        AND (a.last_reminded_at IS NULL OR a.last_reminded_at < NOW() - INTERVAL '3 days')
        AND NOT EXISTS (
          SELECT 1 FROM group_members gm
           WHERE gm.group_id = a.subject_id
             AND gm.organization_id = a.organization_id
        )`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ assignment_id: number; training_id: number; subject_id: number }>;
};

/** Stamp last_reminded_at after a successful send; failures stay
 * unstamped so the next sweep retries them. */
export const stampAssignmentRemindedQuery = async (id: number): Promise<void> => {
  assertPositiveInt(id, "id");
  await sequelize.query(
    `UPDATE training_assignments
        SET last_reminded_at = NOW(),
            updated_at = NOW()
      WHERE id = :id`,
    { replacements: { id } },
  );
};
