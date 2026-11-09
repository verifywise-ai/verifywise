import { AiAppStatus } from "../../domain.layer/enums/ai-app-status.enum";
import { toId } from "./validation.utils";

/**
 * Input rules for AI app bulk import and bulk assessment (#5258). Pure
 * functions, so every rule can be tested without a database.
 */

export const MAX_BULK_ROWS = 1000;
/** Largest value of a Postgres INTEGER id; anything above it cannot match a row. */
export const MAX_POSTGRES_ID = 2147483647;

const NAME_MAX_LENGTH = 255;
const SHORT_TEXT_MAX_LENGTH = 255;
const DESCRIPTION_MAX_LENGTH = 5000;
const QUESTION_DESCRIPTION_MAX_LENGTH = 1000;
const MAX_QUESTIONS = 100;
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 5;
const MIN_ANSWER = 1;
const MAX_ANSWER = 5;

/** Fixed worksheet columns; a question label cannot reuse one. */
export const WORKSHEET_FIXED_COLUMNS = ["Assessment ID", "AI app", "Vendor"];

export interface BulkRowError {
  row: number;
  field: string;
  message: string;
}

export interface AiAppQuestion {
  key: string;
  label: string;
  description?: string;
  weight: number;
}

// ─── Shared cell and id parsing ────────────────────────────────────────────

/** Case-insensitive comparison key: trimmed and lower-cased. */
export function comparisonKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A spreadsheet cell as trimmed text. Cells can arrive as numbers, so numbers
 * and strings are accepted; objects and booleans are not. Blank is "".
 */
export function cellText(value: unknown): { ok: true; text: string } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, text: "" };
  if (typeof value === "string") return { ok: true, text: value.trim() };
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, text: String(value) };
  return { ok: false };
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

export function positiveId(value: unknown): number | null {
  const id = toId(value);
  return Number.isInteger(id) && id > 0 && id <= MAX_POSTGRES_ID ? id : null;
}

/** Unique positive ids from a body field, or null if it isn't a usable list. */
export function parseIdList(value: unknown, max: number = MAX_BULK_ROWS): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const ids = new Set<number>();
  for (const item of value) {
    const id = positiveId(item);
    if (id === null) return null;
    ids.add(id);
  }
  return [...ids];
}

function rowNumberOf(row: unknown, index: number): { row: number; valid: boolean } {
  const raw = (row as { row_number?: unknown } | null)?.row_number;
  const parsed = positiveId(raw);
  return parsed === null ? { row: index + 1, valid: false } : { row: parsed, valid: true };
}

// ─── Status labels ─────────────────────────────────────────────────────────

export const AI_APP_STATUS_LABELS: Record<AiAppStatus, string> = {
  [AiAppStatus.DRAFT]: "Draft",
  [AiAppStatus.UNDER_REVIEW]: "Under review",
  [AiAppStatus.APPROVED]: "Approved",
  [AiAppStatus.RESTRICTED]: "Restricted",
  [AiAppStatus.BANNED]: "Banned",
};

/** The stored status for its stored value or label, in any case; null if neither. */
export function parseAiAppStatus(value: string): AiAppStatus | null {
  const key = comparisonKey(value);
  for (const [status, label] of Object.entries(AI_APP_STATUS_LABELS)) {
    if (key === status || key === label.toLowerCase()) return status as AiAppStatus;
  }
  return null;
}

// ─── Import rows ───────────────────────────────────────────────────────────

export interface ParsedImportRow {
  row: number;
  name: string;
  nameKey: string;
  description: string | null;
  vendor: string | null;
  ownerEmail: string | null;
  status: AiAppStatus;
  departments: string;
  requiredTraining: string | null;
  /** True when this row has an error of its own; it won't be created. */
  invalid: boolean;
}

/** Validates the file's rows. Name duplicates are reported on the later row. */
export function parseImportRows(rows: unknown[]): {
  parsed: ParsedImportRow[];
  errors: BulkRowError[];
} {
  const parsed: ParsedImportRow[] = [];
  const errors: BulkRowError[] = [];
  const seenNames = new Set<string>();

  rows.forEach((raw, index) => {
    const { row, valid: rowNumberValid } = rowNumberOf(raw, index);
    const rowErrors: BulkRowError[] = [];
    const fail = (field: string, message: string) => rowErrors.push({ row, field, message });

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push({ row, field: "row", message: "Row must be an object" });
      return;
    }
    if (!rowNumberValid) fail("row_number", "Row number must be a positive whole number");

    const source = raw as Record<string, unknown>;
    const text = (field: string, label: string, maxLength: number): string => {
      const cell = cellText(source[field]);
      if (!cell.ok) {
        fail(field, `${label} must be text`);
        return "";
      }
      if (cell.text.length > maxLength) {
        fail(field, `${label} must be at most ${maxLength} characters`);
      }
      return cell.text;
    };

    const name = text("name", "Name", NAME_MAX_LENGTH);
    const description = text("description", "Description", DESCRIPTION_MAX_LENGTH);
    const vendor = text("vendor", "Vendor", NAME_MAX_LENGTH);
    const ownerEmail = text("owner_email", "Owner email", SHORT_TEXT_MAX_LENGTH);
    const statusText = text("status", "Status", SHORT_TEXT_MAX_LENGTH);
    const departments = text("departments", "Departments", DESCRIPTION_MAX_LENGTH);
    const requiredTraining = text("required_training", "Required training", SHORT_TEXT_MAX_LENGTH);

    const nameKey = comparisonKey(name);
    if (!name && !rowErrors.some((error) => error.field === "name")) {
      fail("name", "Name is required");
    } else if (name && seenNames.has(nameKey)) {
      fail("name", "This name appears more than once in the file");
    }
    if (name) seenNames.add(nameKey);

    let status = AiAppStatus.DRAFT;
    if (statusText) {
      const resolved = parseAiAppStatus(statusText);
      if (resolved) {
        status = resolved;
      } else if (!rowErrors.some((error) => error.field === "status")) {
        fail("status", `Status must be one of: ${Object.values(AI_APP_STATUS_LABELS).join(", ")}`);
      }
    }

    errors.push(...rowErrors);
    parsed.push({
      row,
      name,
      nameKey,
      description: description || null,
      vendor: vendor || null,
      ownerEmail: ownerEmail ? comparisonKey(ownerEmail) : null,
      status,
      departments,
      requiredTraining: requiredTraining || null,
      invalid: rowErrors.length > 0,
    });
  });

  return { parsed, errors };
}

export interface ImportReferenceData {
  existingAppNameKeys: Set<string>;
  /** comparison key of vendor name -> vendor id */
  vendorIdsByKey: Map<string, number>;
  /** comparison key of email -> user id */
  userIdsByEmail: Map<string, number>;
}

export interface PlannedAiApp {
  row: ParsedImportRow;
  ownerId: number | null;
  vendorId: number | null;
  /** Comparison key of a vendor this import creates; null if it exists or is blank. */
  newVendorKey: string | null;
}

export interface ImportPlan {
  toCreate: PlannedAiApp[];
  skipped: { row: number; name: string; reason: string }[];
  /** comparison key -> first spelling in the file */
  newVendors: Map<string, string>;
  errors: BulkRowError[];
}

/**
 * Decides what a set of parsed rows will do against the organization's data.
 * Rows that are skipped add no vendors and need no owner, so an existing app
 * listed with an unknown owner is still just skipped.
 */
export function planImport(
  parsed: ParsedImportRow[],
  validationErrors: BulkRowError[],
  reference: ImportReferenceData,
): ImportPlan {
  const plan: ImportPlan = {
    toCreate: [],
    skipped: [],
    newVendors: new Map(),
    errors: [...validationErrors],
  };

  for (const row of parsed) {
    if (row.invalid) continue;

    if (reference.existingAppNameKeys.has(row.nameKey)) {
      plan.skipped.push({
        row: row.row,
        name: row.name,
        reason: "An AI app with this name already exists",
      });
      continue;
    }

    let ownerId: number | null = null;
    if (row.ownerEmail) {
      const found = reference.userIdsByEmail.get(row.ownerEmail);
      if (found === undefined) {
        plan.errors.push({
          row: row.row,
          field: "owner_email",
          message: "No user with this email belongs to your organization",
        });
        continue;
      }
      ownerId = found;
    }

    let vendorId: number | null = null;
    let newVendorKey: string | null = null;
    if (row.vendor) {
      const key = comparisonKey(row.vendor);
      const existing = reference.vendorIdsByKey.get(key);
      if (existing !== undefined) {
        vendorId = existing;
      } else {
        newVendorKey = key;
        if (!plan.newVendors.has(key)) plan.newVendors.set(key, row.vendor);
      }
    }

    plan.toCreate.push({ row, ownerId, vendorId, newVendorKey });
  }

  return plan;
}

// ─── Questionnaires ────────────────────────────────────────────────────────

export interface QuestionnaireInput {
  name?: string;
  description?: string | null;
  questions?: AiAppQuestion[];
}

const QUESTION_ERROR =
  "Each question needs a label of at most 255 characters and a weight from 1 to 5";

function parseQuestions(
  raw: unknown,
): { ok: true; questions: AiAppQuestion[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "A questionnaire needs at least one question" };
  }
  if (raw.length > MAX_QUESTIONS) {
    return { ok: false, message: "A questionnaire can have at most 100 questions" };
  }

  const fixedColumns = new Set(WORKSHEET_FIXED_COLUMNS.map(comparisonKey));
  const seenLabels = new Set<string>();
  const questions: AiAppQuestion[] = [];

  for (const [index, item] of raw.entries()) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, message: QUESTION_ERROR };
    }
    const source = item as Record<string, unknown>;

    if (typeof source.label !== "string") return { ok: false, message: QUESTION_ERROR };
    const label = source.label.trim();
    if (!label || label.length > SHORT_TEXT_MAX_LENGTH) {
      return { ok: false, message: QUESTION_ERROR };
    }

    const weight = source.weight;
    if (
      typeof weight !== "number" ||
      !Number.isInteger(weight) ||
      weight < MIN_WEIGHT ||
      weight > MAX_WEIGHT
    ) {
      return { ok: false, message: QUESTION_ERROR };
    }

    const key = comparisonKey(label);
    if (fixedColumns.has(key)) {
      return {
        ok: false,
        message: "A question label cannot be Assessment ID, AI app or Vendor",
      };
    }
    if (seenLabels.has(key)) {
      return { ok: false, message: "Question labels must be unique" };
    }
    seenLabels.add(key);

    const question: AiAppQuestion = { key: `q${index + 1}`, label, weight };
    if (source.description !== undefined && source.description !== null) {
      if (typeof source.description !== "string") {
        return { ok: false, message: "A question description must be text" };
      }
      const description = source.description.trim();
      if (description.length > QUESTION_DESCRIPTION_MAX_LENGTH) {
        return { ok: false, message: "A question description must be at most 1000 characters" };
      }
      if (description) question.description = description;
    }
    questions.push(question);
  }

  return { ok: true, questions };
}

/**
 * Validates a create (all fields) or update (only the fields sent) body.
 * Question keys are assigned here on every save; keys in the body are ignored.
 */
export function parseQuestionnaireBody(
  body: unknown,
  options: { partial: boolean },
): { ok: true; value: QuestionnaireInput } | { ok: false; message: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Questionnaire must be an object" };
  }
  const source = body as Record<string, unknown>;
  const value: QuestionnaireInput = {};

  if (source.name !== undefined || !options.partial) {
    if (typeof source.name !== "string" || !source.name.trim()) {
      return { ok: false, message: "Questionnaire name is required" };
    }
    const name = source.name.trim();
    if (name.length > NAME_MAX_LENGTH) {
      return { ok: false, message: "Questionnaire name must be at most 255 characters" };
    }
    value.name = name;
  }

  if (source.description !== undefined && source.description !== null) {
    if (typeof source.description !== "string") {
      return { ok: false, message: "Questionnaire description must be text" };
    }
    const description = source.description.trim();
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      return { ok: false, message: "Questionnaire description must be at most 5000 characters" };
    }
    value.description = description || null;
  } else if (source.description === null) {
    value.description = null;
  }

  if (source.questions !== undefined || !options.partial) {
    const parsed = parseQuestions(source.questions);
    if (!parsed.ok) return parsed;
    value.questions = parsed.questions;
  }

  if (options.partial && Object.keys(value).length === 0) {
    return { ok: false, message: "Nothing to update" };
  }

  return { ok: true, value };
}

// ─── Answers and score ─────────────────────────────────────────────────────

/** Weighted average on the manual assessment's 0-100 scale. */
export function calculateAssessmentScore(
  questions: AiAppQuestion[],
  answers: Record<string, number>,
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const question of questions) {
    weightedSum += (answers[question.key] ?? 0) * question.weight;
    totalWeight += question.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((weightedSum / totalWeight) * 20)));
}

/** A whole number from 1 to 5, given as a number or numeric text; else null. */
export function parseAnswerValue(value: unknown): number | null {
  let parsed: number;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && /^\s*\d+(\.0+)?\s*$/.test(value)) parsed = Number(value);
  else return null;
  return Number.isInteger(parsed) && parsed >= MIN_ANSWER && parsed <= MAX_ANSWER ? parsed : null;
}

export type AnswerEvaluation =
  | { kind: "blank" }
  | { kind: "answered"; answers: Record<string, number> }
  | { kind: "invalid"; errors: { field: string; message: string }[] };

/**
 * Reads a set of answers against a questionnaire. Answers are keyed by the
 * question key or its label, since worksheet columns carry the label. Blank
 * means no question was answered; partly answered is invalid.
 */
export function evaluateAnswers(questions: AiAppQuestion[], raw: unknown): AnswerEvaluation {
  if (raw === undefined || raw === null) return { kind: "blank" };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      kind: "invalid",
      errors: [{ field: "answers", message: "Answers must be an object" }],
    };
  }

  const questionFor = new Map<string, AiAppQuestion>();
  for (const question of questions) questionFor.set(question.key, question);
  for (const question of questions) {
    const labelKey = comparisonKey(question.label);
    if (!questionFor.has(labelKey)) questionFor.set(labelKey, question);
  }

  const answers: Record<string, number> = {};
  const errors: { field: string; message: string }[] = [];

  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const question = questionFor.get(name) ?? questionFor.get(comparisonKey(name));
    if (isBlank(value)) continue;
    if (!question) {
      errors.push({ field: name, message: "Unknown question" });
      continue;
    }
    const answer = parseAnswerValue(value);
    if (answer === null) {
      errors.push({ field: question.label, message: "Must be a whole number from 1 to 5" });
      continue;
    }
    answers[question.key] = answer;
  }

  if (errors.length > 0) return { kind: "invalid", errors };
  const answered = Object.keys(answers).length;
  if (answered === 0) return { kind: "blank" };
  if (answered < questions.length) {
    const missing = questions.filter((question) => answers[question.key] === undefined);
    return {
      kind: "invalid",
      errors: [
        {
          field: "answers",
          message: `Answer every question or leave the row blank. Missing: ${missing
            .map((question) => question.label)
            .join(", ")}`,
        },
      ],
    };
  }
  return { kind: "answered", answers };
}

// ─── Who can answer, and who hears about it ────────────────────────────────

export interface AssessmentActor {
  userId: number;
  /** Holds aiApp.edit, which covers every app in the organization. */
  canEditAny: boolean;
}

/** aiApp.edit covers any app; otherwise only the app's current owner may act. */
export function canActOnApp(ownerId: number | null | undefined, actor: AssessmentActor): boolean {
  return (
    actor.canEditAny || (ownerId !== null && ownerId !== undefined && ownerId === actor.userId)
  );
}

/** What the answer actions follow: false once the assessment is completed. */
export function canAnswerAssessment(
  status: string,
  ownerId: number | null | undefined,
  actor: AssessmentActor,
): boolean {
  return status === "pending" && canActOnApp(ownerId, actor);
}

/**
 * One summary per distinct owner of the assessments a run created. Apps with
 * no owner are counted as unassigned; the requester is not told about their
 * own run, though their apps are still assigned.
 */
export function groupOwnerSummaries(
  ownerIds: (number | null)[],
  requesterId: number,
): { summaries: { ownerId: number; count: number }[]; unassigned: number } {
  const counts = new Map<number, number>();
  let unassigned = 0;
  for (const ownerId of ownerIds) {
    if (ownerId === null) {
      unassigned += 1;
    } else if (ownerId !== requesterId) {
      counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
    }
  }
  return {
    summaries: [...counts].map(([ownerId, count]) => ({ ownerId, count })),
    unassigned,
  };
}

export interface WorksheetAssessment {
  id: number;
  ai_app_id: number;
  status: "pending" | "completed";
}

export interface WorksheetCompletion {
  assessmentId: number;
  aiAppId: number;
  answers: Record<string, number>;
  score: number;
}

export interface WorksheetEvaluation {
  completions: WorksheetCompletion[];
  leftBlank: number;
  alreadyCompleted: number;
  errors: BulkRowError[];
}

/**
 * Applies the worksheet rules: blank rows stay pending, completed assessments
 * are counted and left alone, and anything else must be fully and validly
 * answered. An assessment listed twice is an error on the later row.
 */
export function evaluateWorksheetRows(
  rows: unknown[],
  questions: AiAppQuestion[],
  assessments: Map<number, WorksheetAssessment>,
): WorksheetEvaluation {
  const result: WorksheetEvaluation = {
    completions: [],
    leftBlank: 0,
    alreadyCompleted: 0,
    errors: [],
  };
  const seen = new Set<number>();

  rows.forEach((raw, index) => {
    const { row, valid } = rowNumberOf(raw, index);
    const fail = (field: string, message: string) => result.errors.push({ row, field, message });

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      fail("row", "Row must be an object");
      return;
    }
    if (!valid) fail("row_number", "Row number must be a positive whole number");

    const source = raw as Record<string, unknown>;
    const assessmentId = positiveId(source.assessment_id);
    const assessment = assessmentId === null ? undefined : assessments.get(assessmentId);
    if (assessmentId === null || !assessment) {
      fail("assessment_id", "Unknown assessment");
      return;
    }
    if (seen.has(assessmentId)) {
      fail("assessment_id", "This assessment appears more than once in the file");
      return;
    }
    seen.add(assessmentId);

    if (assessment.status === "completed") {
      result.alreadyCompleted += 1;
      return;
    }

    const evaluation = evaluateAnswers(questions, source.answers);
    if (evaluation.kind === "blank") {
      result.leftBlank += 1;
    } else if (evaluation.kind === "invalid") {
      evaluation.errors.forEach((error) => fail(error.field, error.message));
    } else {
      result.completions.push({
        assessmentId,
        aiAppId: assessment.ai_app_id,
        answers: evaluation.answers,
        score: calculateAssessmentScore(questions, evaluation.answers),
      });
    }
  });

  return result;
}
