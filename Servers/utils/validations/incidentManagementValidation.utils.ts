/**
 * Incident Management specific validation utilities
 * Contains validation schemas and functions specifically for AI incident reporting and compliance (EU AI Act Article 73)
 */

import {
  AIIncidentManagementStatus,
  AIIncidentManagementApprovalStatus,
  HarmCategory,
  IncidentType,
  Severity,
} from "../../domain.layer/enums/ai-incident-management.enum";
import {
  validateString,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

/**
 * Maximum length of an incident description. Matches Jira's text-field limit
 * (32,767 characters) so descriptions copied from Jira issues are not cut off.
 * The `ai_incident_managements.description` column is TEXT, so the database
 * imposes no lower ceiling.
 */
export const INCIDENT_DESCRIPTION_MAX_LENGTH = 32767;

export const INCIDENT_DESCRIPTION_MIN_LENGTH = 5;

/*
 * Same text as the frontend messages
 * (Clients/src/application/validations/incidentValidation.ts) and the
 * Servers/locales keys.
 */
export const INCIDENT_DESCRIPTION_REQUIRED_MESSAGE = "Description is required.";
export const INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE = `Description must be at least ${INCIDENT_DESCRIPTION_MIN_LENGTH} characters.`;
export const INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE = `Description cannot exceed ${INCIDENT_DESCRIPTION_MAX_LENGTH.toLocaleString("en-US")} characters.`;

/**
 * Longest value of the VARCHAR(255) text columns a caller writes:
 * ai_project, reporter and model_system_version. (type, severity, status and
 * approval_status are checked against their enums instead.)
 */
export const INCIDENT_TEXT_COLUMN_MAX_LENGTH = 255;

/**
 * Validation limits for incident management
 */
export const INCIDENT_VALIDATION_LIMITS = {
  DESCRIPTION: { MIN: INCIDENT_DESCRIPTION_MIN_LENGTH, MAX: INCIDENT_DESCRIPTION_MAX_LENGTH },
  TEXT_COLUMN: { MAX: INCIDENT_TEXT_COLUMN_MAX_LENGTH },
} as const;

/** Incident types (IncidentType). The column has no CHECK constraint, so this list is the only gate. */
export const INCIDENT_TYPE_ENUM: readonly string[] = Object.values(IncidentType);

/**
 * Incident severity levels (Severity). Must match the CHECK constraint
 * ai_incident_managements_severity_check.
 */
export const INCIDENT_SEVERITY_ENUM: readonly string[] = Object.values(Severity);

/**
 * Incident status values (AIIncidentManagementStatus). Must match the CHECK
 * constraint ai_incident_managements_status_check.
 */
export const INCIDENT_STATUS_ENUM: readonly string[] = Object.values(AIIncidentManagementStatus);

/**
 * Approval status values (AIIncidentManagementApprovalStatus). Must match the
 * CHECK constraint ai_incident_managements_approval_status_check.
 */
export const APPROVAL_STATUS_ENUM: readonly string[] = Object.values(
  AIIncidentManagementApprovalStatus,
);

/** Categories of harm (HarmCategory): the values the incident page offers and stores. */
export const INCIDENT_HARM_CATEGORIES_ENUM: readonly string[] = Object.values(HarmCategory);

/**
 * Validates description
 */
export const validateDescription = (value: any): ValidationResult => {
  const result = validateString(value, "Description", {
    required: true,
    minLength: INCIDENT_VALIDATION_LIMITS.DESCRIPTION.MIN,
    maxLength: INCIDENT_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
  if (result.isValid) return result;
  const message =
    result.code === "MAX_LENGTH"
      ? INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE
      : result.code === "MIN_LENGTH"
        ? INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE
        : result.code === "REQUIRED_FIELD" || result.code === "EMPTY_STRING"
          ? INCIDENT_DESCRIPTION_REQUIRED_MESSAGE
          : result.message;
  return { ...result, message };
};

const normalizeDescription = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value).trim();

/**
 * True when an update sets a description that differs from the stored one.
 * Both sides are normalised (null/undefined → "", trimmed), so "" vs NULL on
 * an older row, or added surrounding whitespace, is not a change. Unchanged
 * descriptions are not re-validated, so editing other fields of an older row
 * whose description predates the current rule still works.
 */
export const isIncidentDescriptionChanged = (next: unknown, existing: unknown): boolean =>
  next !== undefined && normalizeDescription(next) !== normalizeDescription(existing);

/**
 * Throws a ValidationException (HTTP 400) when the description breaks the
 * length rule. Called from the shared incident write queries so every writer
 * (REST controller, AI Advisor tools, future integrations) gets the same rule.
 * The value is deliberately left out of the exception metadata: it can be
 * tens of kilobytes.
 */
export const assertValidIncidentDescription = (value: unknown): void => {
  const result = validateDescription(value);
  if (!result.isValid) {
    // `field` is repeated inside metadata: ValidationException lets
    // options.metadata replace the metadata it builds from its arguments.
    throw new ValidationException(
      result.message || "Invalid description",
      "description",
      undefined,
      {
        metadata: { field: "description", validationCode: result.code },
      },
    );
  }
};

/**
 * A field error with its translation key: controllers send
 * translateError(req, error), which uses `i18nKey` / `i18nVars`; `message` is
 * the English text.
 */
export interface IncidentFieldError extends ValidationError {
  i18nKey: string;
  i18nVars: Record<string, string | number>;
}

const REQUIRED_KEY = "{field} is required";
const TEXT_KEY = "{field} must be text";
const TOO_LONG_KEY = "{field} must be at most {max} characters";
const ONE_OF_KEY = "{field} must be one of: {values}";
const DATE_KEY = "{field} must be a valid date (YYYY-MM-DD)";
const FUTURE_KEY = "{field} cannot be in the future";
const BOOLEAN_KEY = "{field} must be true or false";
const HARM_KEY = "{field} must be a list of these categories: {values}";
const DATE_ORDER_KEY = "date_detected cannot be earlier than occurred_date";
const USER_ID_KEY = "{field} must be a user id";

const fillPlaceholders = (key: string, vars: Record<string, string | number>): string =>
  key.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));

const fieldError = (
  field: string,
  code: string,
  i18nKey: string,
  vars: Record<string, string | number> = {},
): IncidentFieldError => {
  const i18nVars = { field, ...vars };
  return { field, code, message: fillPlaceholders(i18nKey, i18nVars), i18nKey, i18nVars };
};

/** undefined, null, or a string that is empty after trimming. */
export const isBlankIncidentValue = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** A text field: a string, non-blank when required, at most `max` characters. */
const checkText = (
  field: string,
  value: unknown,
  { required, max }: { required: boolean; max?: number },
): IncidentFieldError | null => {
  if (value === undefined || value === null || value === "") {
    return required ? fieldError(field, "REQUIRED_FIELD", REQUIRED_KEY) : null;
  }
  if (typeof value !== "string") return fieldError(field, "INVALID_TYPE", TEXT_KEY);
  if (required && value.trim() === "") return fieldError(field, "REQUIRED_FIELD", REQUIRED_KEY);
  if (max !== undefined && value.length > max) {
    return fieldError(field, "MAX_LENGTH", TOO_LONG_KEY, { max });
  }
  return null;
};

/** A required value from `allowed` (exact match). */
const checkEnum = (
  field: string,
  value: unknown,
  allowed: readonly string[],
): IncidentFieldError | null => {
  if (isBlankIncidentValue(value)) return fieldError(field, "REQUIRED_FIELD", REQUIRED_KEY);
  if (typeof value !== "string" || !allowed.includes(value)) {
    return fieldError(field, "INVALID_ENUM_VALUE", ONE_OF_KEY, { values: allowed.join(", ") });
  }
  return null;
};

/**
 * The calendar date (YYYY-MM-DD) of a date value the caller sent, or null
 * when it is not a real date. Accepts a Date or a string starting with
 * YYYY-MM-DD (a date or an ISO date-time); "2026-02-30" is not a date.
 */
const sentCalendarDate = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : incidentCalendarDate(value);
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match || Number.isNaN(new Date(value.trim()).getTime())) return null;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    ? match[0]
    : null;
};

/** Hours the furthest-ahead time zone (UTC+14) is ahead of UTC. */
const FURTHEST_AHEAD_UTC_OFFSET_HOURS = 14;

/**
 * The latest calendar date an incident date may have: today in UTC+14, the
 * furthest-ahead time zone. A date that is today anywhere in the world is
 * accepted, and anything later is refused.
 */
export const latestIncidentDate = (now: Date = new Date()): string =>
  new Date(now.getTime() + FURTHEST_AHEAD_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

/** A required date that is a real calendar date and not in the future. */
const checkDate = (field: string, value: unknown): IncidentFieldError | null => {
  if (isBlankIncidentValue(value)) return fieldError(field, "REQUIRED_FIELD", REQUIRED_KEY);
  const date = sentCalendarDate(value);
  if (!date) return fieldError(field, "INVALID_DATE", DATE_KEY);
  if (date > latestIncidentDate()) return fieldError(field, "FUTURE_DATE", FUTURE_KEY);
  return null;
};

/** An optional user id: a positive integer, or empty for none. */
const checkUserId = (field: string, value: unknown): IncidentFieldError | null =>
  isBlankIncidentValue(value) || toIncidentUserId(value) !== null
    ? null
    : fieldError(field, "INVALID_TYPE", USER_ID_KEY);

/** An optional boolean. */
const checkBoolean = (field: string, value: unknown): IncidentFieldError | null =>
  value === undefined || value === null || typeof value === "boolean"
    ? null
    : fieldError(field, "INVALID_TYPE", BOOLEAN_KEY);

/**
 * A list (possibly empty) of strings from INCIDENT_HARM_CATEGORIES_ENUM.
 * Items in `kept` (the stored categories, on update) are also accepted, so a
 * row holding an older value outside the list can still be edited; only the
 * items an update adds must come from the list.
 */
const checkHarmCategories = (
  value: unknown,
  kept: readonly unknown[] = [],
): IncidentFieldError | null =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      (typeof item === "string" && INCIDENT_HARM_CATEGORIES_ENUM.includes(item)) ||
      kept.some((stored) => JSON.stringify(stored) === JSON.stringify(item)),
  )
    ? null
    : fieldError("categories_of_harm", "INVALID_HARM_CATEGORY", HARM_KEY, {
        values: INCIDENT_HARM_CATEGORIES_ENUM.join(", "),
      });

/** The stored harm categories as a list (the JSON column may come back as a string). */
const storedHarmCategories = (stored: unknown): unknown[] => {
  const list = toHarmArray(stored);
  return Array.isArray(list) ? list : [];
};

/**
 * Harm categories as a create request may send them: a list, or the
 * comma-separated string form ("Health, Safety"). Absent or empty is [].
 * Anything else is returned unchanged, for checkHarmCategories to refuse.
 */
export const parseCreateHarmCategories = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  }
  return value;
};

export const validateSeverity = (value: unknown): ValidationResult => {
  const error = checkEnum("severity", value, INCIDENT_SEVERITY_ENUM);
  return error ? { isValid: false, message: error.message, code: error.code } : { isValid: true };
};

export const validateStatus = (value: unknown): ValidationResult => {
  const error = checkEnum("status", value, INCIDENT_STATUS_ENUM);
  return error ? { isValid: false, message: error.message, code: error.code } : { isValid: true };
};

export const validateApprovalStatus = (value: unknown): ValidationResult => {
  const error = checkEnum("approval_status", value, APPROVAL_STATUS_ENUM);
  return error ? { isValid: false, message: error.message, code: error.code } : { isValid: true };
};

/**
 * The rule for each incident field a caller writes (description and the
 * reference ids have their own). A rule gets the value as sent and returns a
 * field error or null. Required fields refuse an empty value; optional ones
 * accept it.
 */
const FIELD_RULES: Record<string, (value: unknown) => IncidentFieldError | null> = {
  ai_project: (v) =>
    checkText("ai_project", v, { required: true, max: INCIDENT_TEXT_COLUMN_MAX_LENGTH }),
  type: (v) => checkEnum("type", v, INCIDENT_TYPE_ENUM),
  severity: (v) => checkEnum("severity", v, INCIDENT_SEVERITY_ENUM),
  status: (v) => checkEnum("status", v, INCIDENT_STATUS_ENUM),
  approval_status: (v) => checkEnum("approval_status", v, APPROVAL_STATUS_ENUM),
  occurred_date: (v) => checkDate("occurred_date", v),
  date_detected: (v) => checkDate("date_detected", v),
  reporter: (v) =>
    checkText("reporter", v, { required: true, max: INCIDENT_TEXT_COLUMN_MAX_LENGTH }),
  reporter_id: (v) => checkUserId("reporter_id", v),
  model_system_version: (v) =>
    checkText("model_system_version", v, {
      required: false,
      max: INCIDENT_TEXT_COLUMN_MAX_LENGTH,
    }),
  affected_persons_groups: (v) => checkText("affected_persons_groups", v, { required: false }),
  relationship_causality: (v) => checkText("relationship_causality", v, { required: false }),
  immediate_mitigations: (v) => checkText("immediate_mitigations", v, { required: false }),
  planned_corrective_actions: (v) =>
    checkText("planned_corrective_actions", v, { required: false }),
  approval_notes: (v) => checkText("approval_notes", v, { required: false }),
  categories_of_harm: (v) => checkHarmCategories(v),
  interim_report: (v) => checkBoolean("interim_report", v),
  archived: (v) => checkBoolean("archived", v),
};

/**
 * Fields a new incident may leave out: the server fills them in
 * (status Open, approval Pending).
 */
export const INCIDENT_CREATE_DEFAULTS = {
  status: AIIncidentManagementStatus.OPEN,
  approval_status: AIIncidentManagementApprovalStatus.PENDING,
} as const;

/** The date-order error when both dates are valid and detected is before occurred, else null. */
const dateOrderError = (occurred: unknown, detected: unknown): IncidentFieldError | null => {
  const occurredDate = sentCalendarDate(occurred);
  const detectedDate = sentCalendarDate(detected);
  if (!occurredDate || !detectedDate || detectedDate >= occurredDate) return null;
  return fieldError("date_detected", "INVALID_DATE_ORDER", DATE_ORDER_KEY);
};

/**
 * Validates an optional incident reference FK (issue #4583).
 * Accepts undefined/null/"" (no link) but rejects non-integers and 0
 * (0 is not a valid primary key and would fail the FK constraint).
 */
export const validateOptionalIncidentReference = (value: any, field: string): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true };
  }
  const numValue = Number(value);
  if (isNaN(numValue) || !Number.isInteger(numValue) || numValue < 1) {
    return {
      isValid: false,
      message: `${field} must be a positive integer ID`,
      code: "INVALID_ID",
    };
  }
  return { isValid: true };
};

export const validateModelInventoryId = (value: any): ValidationResult =>
  validateOptionalIncidentReference(value, "Model inventory ID");

export const validateProjectId = (value: any): ValidationResult =>
  validateOptionalIncidentReference(value, "Project ID");

export const validateAssigneeId = (value: any): ValidationResult =>
  validateOptionalIncidentReference(value, "Assignee ID");

/** Reference ids: optional, positive integers when given. */
const referenceSchema = {
  model_inventory_id: validateModelInventoryId,
  project_id: validateProjectId,
  assignee_id: validateAssigneeId,
};

export const validateIncidentIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Incident ID", true);
};

/**
 * Field validation for a new incident: every field rule (FIELD_RULES) on the
 * value sent, the description and reference ids, and detected on or after
 * occurred. status and approval_status may be left out
 * (INCIDENT_CREATE_DEFAULTS); harm categories may come as a list or the
 * comma-separated string form.
 */
export const validateCompleteIncidentCreation = (data: any): ValidationError[] => {
  const body = data ?? {};
  const errors: ValidationError[] = [];
  const description = validateDescription(body.description);
  if (!description.isValid) {
    errors.push({
      field: "description",
      message: description.message || "Invalid value",
      code: description.code || "INVALID_VALUE",
    });
  }
  // A reporter picked from the organization's users (reporter_id) stands in
  // for the reporter text: the server writes the user's name there.
  const hasReporterId = !isBlankIncidentValue(body.reporter_id);
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    let value = body[field];
    if (field in INCIDENT_CREATE_DEFAULTS && isBlankIncidentValue(value)) continue;
    if (field === "reporter" && hasReporterId) continue;
    if (field === "categories_of_harm") value = parseCreateHarmCategories(value);
    const error = rule(value);
    if (error) errors.push(error);
  }
  errors.push(...validateSchema(body, referenceSchema));
  const order = dateOrderError(body.occurred_date, body.date_detected);
  if (order) errors.push(order);
  return errors;
};

/**
 * Field validation for an update, against the stored row (`existingData`,
 * the row the service has locked). Only fields the update changes are
 * checked (isSameIncidentValue), so editing one field of an older row whose
 * other values predate a rule still works. A changed required field cannot
 * be blanked (null or ""). When either date changes, the dates the row would
 * end up with (the update over the stored row) must keep detected on or
 * after occurred. Without `existingData` every field sent is checked.
 */
export const validateIncidentUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  // Any status can move to any other status, including Closed back to an
  // open status (reopening). See applyReopenApprovalReset for the approval
  // side effect of a reopen.
  const update = data ?? {};
  const stored = existingData ?? {};
  const errors: ValidationError[] = [];
  const changes = (field: string): boolean =>
    update[field] !== undefined &&
    (existingData === undefined || !isSameIncidentValue(field, stored[field], update[field]));

  // The description is checked only when the update changes it (see
  // isIncidentDescriptionChanged). The write query applies the same rule as
  // a backstop.
  if (isIncidentDescriptionChanged(update.description, stored.description)) {
    const result = validateDescription(update.description);
    if (!result.isValid) {
      errors.push({
        field: "description",
        message: result.message || "Invalid value",
        code: result.code || "INVALID_VALUE",
      });
    }
  }
  // The reporter the row ends up with. A reporter_id sent (changed or not)
  // makes the server write that member's name into the reporter text, so the
  // text sent does not count. Otherwise the text sent, or the stored one, must
  // be present when the reporter changes: a new text, or the user cleared.
  const derivesReporter = !isBlankIncidentValue(update.reporter_id);
  const clearsReporterId = update.reporter_id !== undefined && !derivesReporter;
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    if (field === "reporter") {
      if (derivesReporter || !(changes("reporter") || clearsReporterId)) continue;
      const error = rule(update.reporter !== undefined ? update.reporter : stored.reporter);
      if (error) errors.push(error);
      continue;
    }
    if (!changes(field)) continue;
    const error =
      field === "categories_of_harm"
        ? checkHarmCategories(update[field], storedHarmCategories(stored.categories_of_harm))
        : rule(update[field]);
    if (error) errors.push(error);
  }
  if (changes("occurred_date") || changes("date_detected")) {
    const effective = (field: string) =>
      update[field] !== undefined ? update[field] : stored[field];
    const order = dateOrderError(effective("occurred_date"), effective("date_detected"));
    if (order) errors.push(order);
  }
  return errors;
};

/** Approval fields a caller can set; touching any of them disables the reopen reset. */
const APPROVAL_FIELDS = [
  "approval_status",
  "approved_by",
  "approved_by_id",
  "approval_date",
  "approval_notes",
] as const;

/** Incident date columns. Compared as calendar dates (see incidentCalendarDate). */
export const INCIDENT_DATE_COLUMNS: ReadonlySet<string> = new Set([
  "occurred_date",
  "date_detected",
  "approval_date",
]);

/**
 * Incident foreign-key columns (issue #4583, and the reporter / approver
 * users). Compared as numbers; '' means none.
 */
export const INCIDENT_FK_COLUMNS: ReadonlySet<string> = new Set([
  "model_inventory_id",
  "project_id",
  "assignee_id",
  "reporter_id",
  "approved_by_id",
]);

/** Incident boolean columns. null / undefined count as false. */
export const INCIDENT_BOOLEAN_COLUMNS: ReadonlySet<string> = new Set([
  "archived",
  "interim_report",
]);

const isEmptyValue = (value: unknown): boolean =>
  value === null || value === undefined || value === "";

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * The calendar date (YYYY-MM-DD) of an incident date value. The date columns
 * are DATE, which Sequelize's parser returns as the "YYYY-MM-DD" string, on
 * raw queries too.
 *
 * - A string starting with YYYY-MM-DD is that date, whatever follows (an ISO
 *   date-time's time and offset are ignored: the caller's day is the one
 *   written).
 * - A Date is an instant some server code built (the Advisor's "today", a
 *   Jira issue's creation time): its UTC date, the date the database session
 *   (UTC) has always stored for it.
 */
export const incidentCalendarDate = (value: unknown): string | null => {
  if (isEmptyValue(value)) return null;
  if (typeof value === "string") {
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
    if (match) return match[0];
  }
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

/**
 * The value to write to (or send out for) an incident DATE column:
 * "YYYY-MM-DD", or null for none. Unparseable values pass through so the
 * database refuses them rather than storing a guess (validation runs first).
 */
export const toIncidentDateValue = (value: unknown): string | null => {
  if (isEmptyValue(value)) return null;
  return incidentCalendarDate(value);
};

/**
 * An incident day formatted for people (emails, reports): the day itself, in
 * UTC, so it never becomes the day before on a server west of UTC. "" for no
 * date; the value as given when it is not a date.
 */
export const formatIncidentDay = (
  value: unknown,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const day = toIncidentDateValue(value);
  if (!day) return "";
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
};

/** Hours the furthest-behind time zone (UTC-12) is behind UTC. */
const FURTHEST_BEHIND_UTC_OFFSET_HOURS = 12;

/** The earliest date that is today somewhere: today in UTC-12. */
export const earliestIncidentToday = (now: Date = new Date()): string =>
  new Date(now.getTime() - FURTHEST_BEHIND_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

/**
 * The day the acting user records (an approval date, the Advisor's incident
 * days), as "YYYY-MM-DD": the local date their browser sent (the
 * X-Client-Date header, see getRequestClientDate) when it is a real date
 * that is today somewhere on earth right now (today in UTC-12 to today in
 * UTC+14), else today in UTC. So an approver in Toronto at 20:00 records
 * their own day, not tomorrow, and no caller can backdate or postdate it.
 */
export const incidentToday = (clientDate?: unknown, now: Date = new Date()): string => {
  if (typeof clientDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(clientDate)) {
    const day = sentCalendarDate(clientDate);
    if (day && day >= earliestIncidentToday(now) && day <= latestIncidentDate(now)) return day;
  }
  return now.toISOString().slice(0, 10);
};

/**
 * A user id sent for reporter_id: a positive integer (number or digits), or
 * null when it is not one.
 */
export const toIncidentUserId = (value: unknown): number | null => {
  const id =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const toHarmArray = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Whether `sent` would store the same value incident column `column` already
 * holds (`stored`). This is the one comparison used both to decide whether a
 * caller touched an approval field (applyReopenApprovalReset) and to decide
 * which columns an update writes and records in history
 * (diffIncidentColumns).
 *
 * '' / null / undefined are all "empty"; booleans treat empty as false; date
 * columns compare calendar dates; foreign keys compare numerically; harm
 * categories compare as a set, ignoring order; other values compare by value
 * (objects and arrays by their JSON, in order).
 */
export const isSameIncidentValue = (column: string, stored: unknown, sent: unknown): boolean => {
  if (INCIDENT_BOOLEAN_COLUMNS.has(column)) return Boolean(stored) === Boolean(sent);
  if (isEmptyValue(stored) || isEmptyValue(sent)) {
    return isEmptyValue(stored) && isEmptyValue(sent);
  }
  if (INCIDENT_DATE_COLUMNS.has(column)) {
    return incidentCalendarDate(stored) === incidentCalendarDate(sent);
  }
  if (INCIDENT_FK_COLUMNS.has(column)) return Number(stored) === Number(sent);
  if (column === "categories_of_harm") {
    const storedList = toHarmArray(stored);
    const sentList = toHarmArray(sent);
    if (Array.isArray(storedList) && Array.isArray(sentList)) {
      // Harm categories are a set: order does not make a change. Items are
      // compared by their JSON, so types and object contents still count.
      const sorted = (list: unknown[]) =>
        JSON.stringify(list.map((item) => JSON.stringify(item)).sort());
      return sorted(storedList) === sorted(sentList);
    }
  }
  if (typeof stored === "object" || typeof sent === "object") {
    return JSON.stringify(stored) === JSON.stringify(sent);
  }
  return String(stored) === String(sent);
};

/**
 * Approval on an incident is sign-off on its closure. When a Closed incident
 * is reopened (status moves from Closed to anything else) and its stored
 * approval is Approved, that sign-off no longer describes it, so the update
 * is rewritten to approval_status Pending with approved_by, approval_date and
 * approval_notes cleared. Change history keeps the old values. Pending,
 * Rejected and Not required approvals are left alone.
 *
 * If the update itself changes any approval field (a value that differs from
 * the stored one), the caller has made an explicit approval decision and the
 * update is kept as sent. A field sent back with its stored value counts as
 * "not touched" (the edit form always sends every field), so keeping an
 * incident Approved through a reopen takes a deliberate re-approval in a
 * later update.
 *
 * Returns the update unchanged when no reset applies, otherwise a copy.
 */
export const applyReopenApprovalReset = <T extends Record<string, any>>(
  existing: Record<string, any>,
  update: T,
): T => {
  const isReopen =
    existing.status === AIIncidentManagementStatus.CLOSED &&
    update.status !== undefined &&
    update.status !== AIIncidentManagementStatus.CLOSED;
  if (!isReopen || existing.approval_status !== AIIncidentManagementApprovalStatus.APPROVED) {
    return update;
  }

  const callerChangedApproval = APPROVAL_FIELDS.some(
    (field) =>
      update[field] !== undefined && !isSameIncidentValue(field, existing[field], update[field]),
  );
  if (callerChangedApproval) return update;

  return {
    ...update,
    approval_status: AIIncidentManagementApprovalStatus.PENDING,
    approved_by: null,
    approved_by_id: null,
    approval_date: null,
    approval_notes: null,
  };
};

/**
 * Approval fields the server sets: who recorded the decision and when.
 * Callers cannot send them; every write path drops them from the request.
 */
export const SERVER_SET_APPROVAL_FIELDS = [
  "approved_by",
  "approved_by_id",
  "approval_date",
] as const;

/** Approval fields a caller may change, with incident.approve. */
export const CALLER_APPROVAL_FIELDS: ReadonlySet<string> = new Set([
  "approval_status",
  "approval_notes",
]);

/** Approval statuses that record a decision, so they name an approver and a date. */
const DECISION_STATUSES: ReadonlySet<string> = new Set([
  AIIncidentManagementApprovalStatus.APPROVED,
  AIIncidentManagementApprovalStatus.REJECTED,
]);

/** `values` without the server-set approval fields (approved_by, approval_date). */
export const withoutServerSetApprovalFields = <T extends Record<string, unknown>>(values: T): T => {
  const copy: Record<string, unknown> = { ...values };
  for (const field of SERVER_SET_APPROVAL_FIELDS) delete copy[field];
  return copy as T;
};

/**
 * What a write does to approved_by, approved_by_id and approval_date, given
 * the stored approval status (undefined on create) and the one being written:
 *
 * - "stamp": the status changes to Approved or Rejected. The server records
 *   the acting user as approver (name and id) and today (UTC) as the
 *   approval date.
 * - "clear": the status changes to Pending or Not required (or a new incident
 *   starts without a decision). Both are cleared.
 * - "keep": the status does not change (or is not written). Both stay as
 *   stored, so editing approval notes does not re-sign the decision.
 */
export const approvalStampFor = (
  storedStatus: unknown,
  nextStatus: unknown,
): "stamp" | "clear" | "keep" => {
  if (nextStatus === undefined) return "keep";
  if (
    storedStatus !== undefined &&
    isSameIncidentValue("approval_status", storedStatus, nextStatus)
  )
    return "keep";
  return DECISION_STATUSES.has(String(nextStatus)) ? "stamp" : "clear";
};

/**
 * Complete validation for incident update
 */
export const validateCompleteIncidentUpdate = (
  data: any,
  existingData?: any,
): ValidationError[] => [
  ...validateSchema(data ?? {}, referenceSchema),
  ...validateIncidentUpdateBusinessRules(data, existingData),
];
