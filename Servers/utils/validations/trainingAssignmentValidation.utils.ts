/**
 * Request validation for training assignments (#5260). Pure functions: each
 * returns the cleaned value, or an English message the controller translates.
 */

export const MAX_ASSIGNEES_PER_REQUEST = 500;

/** Ids are INTEGER columns, so a larger number could never match a row. */
const MAX_ID = 2147483647;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_PATTERN = /^[1-9]\d*$/;

export type Parsed<T> =
  { ok: true; value: T } | { ok: false; message: string; vars?: Record<string, string | number> };

export interface CreateAssignmentsInput {
  training_id: number;
  user_ids: number[];
  due_date: string;
}

const fail = (message: string, vars?: Record<string, string | number>): Parsed<never> => ({
  ok: false,
  message,
  vars,
});

const isValidId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID;

/** Today in UTC as "YYYY-MM-DD", the same calendar as the database's CURRENT_DATE. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

function parseIdFromText(value: unknown, message: string): Parsed<number> {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) return fail(message);
  const id = Number(value);
  return isValidId(id) ? { ok: true, value: id } : fail(message);
}

export const parseAssignmentId = (value: unknown): Parsed<number> =>
  parseIdFromText(value, "Assignment ID must be a positive integer");

export const parseTrainingIdQuery = (value: unknown): Parsed<number> =>
  parseIdFromText(value, "Training ID must be a positive integer");

export function parseTrainingId(value: unknown): Parsed<number> {
  return isValidId(value) ? { ok: true, value } : fail("Training ID must be a positive integer");
}

function isRealCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A strict "YYYY-MM-DD" that is a real date, today or later. */
export function parseDueDate(value: unknown, today: string = todayUtc()): Parsed<string> {
  if (typeof value !== "string" || !isRealCalendarDate(value)) {
    return fail("Due date must be a valid date in YYYY-MM-DD format");
  }
  if (value < today) return fail("Due date must be today or later");
  return { ok: true, value };
}

export function parseUserIds(value: unknown): Parsed<number[]> {
  const message = "User IDs must be a non-empty list of positive integers";
  if (!Array.isArray(value) || value.length === 0 || !value.every(isValidId)) return fail(message);
  const unique = [...new Set(value as number[])];
  if (unique.length > MAX_ASSIGNEES_PER_REQUEST) {
    return fail("A training can be assigned to at most {max} people at once", {
      max: MAX_ASSIGNEES_PER_REQUEST,
    });
  }
  return { ok: true, value: unique };
}

export function parseCreateAssignments(
  body: Record<string, unknown> | undefined,
  today: string = todayUtc(),
): Parsed<CreateAssignmentsInput> {
  const trainingId = parseTrainingId(body?.training_id);
  if (!trainingId.ok) return trainingId;
  const userIds = parseUserIds(body?.user_ids);
  if (!userIds.ok) return userIds;
  const dueDate = parseDueDate(body?.due_date, today);
  if (!dueDate.ok) return dueDate;
  return {
    ok: true,
    value: { training_id: trainingId.value, user_ids: userIds.value, due_date: dueDate.value },
  };
}
