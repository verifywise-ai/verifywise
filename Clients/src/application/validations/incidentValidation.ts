import dayjs, { Dayjs } from "dayjs";

/**
 * Mirrors INCIDENT_VALIDATION_LIMITS.DESCRIPTION in
 * Servers/utils/validations/incidentManagementValidation.utils.ts.
 * Keep in sync — this is the frontend SSOT for the same rule.
 *
 * 32,767 is Jira's text-field limit, so descriptions copied from Jira issues
 * fit without truncation. Lengths are measured after trimming whitespace,
 * as on the backend.
 */
export const INCIDENT_DESCRIPTION_MIN_LENGTH = 5;
export const INCIDENT_DESCRIPTION_MAX_LENGTH = 32767;

export const INCIDENT_DESCRIPTION_REQUIRED_MESSAGE = "Description is required.";
export const INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE = `Description must be at least ${INCIDENT_DESCRIPTION_MIN_LENGTH} characters.`;
export const INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE = `Description cannot exceed ${INCIDENT_DESCRIPTION_MAX_LENGTH.toLocaleString("en-US")} characters.`;

const normalizeDescription = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value).trim();

/**
 * Returns an error message for an incident description, or "" when valid.
 */
export function validateIncidentDescription(value: unknown): string {
  const trimmed = normalizeDescription(value);
  if (!trimmed) return INCIDENT_DESCRIPTION_REQUIRED_MESSAGE;
  if (trimmed.length < INCIDENT_DESCRIPTION_MIN_LENGTH) {
    return INCIDENT_DESCRIPTION_TOO_SHORT_MESSAGE;
  }
  if (trimmed.length > INCIDENT_DESCRIPTION_MAX_LENGTH) {
    return INCIDENT_DESCRIPTION_TOO_LONG_MESSAGE;
  }
  return "";
}

/**
 * Mirrors INCIDENT_TEXT_COLUMN_MAX_LENGTH in
 * Servers/utils/validations/incidentManagementValidation.utils.ts: the
 * VARCHAR(255) text columns (model / system version here; use case and
 * reporter are picked from lists).
 */
export const INCIDENT_TEXT_MAX_LENGTH = 255;

export const INCIDENT_TYPE_REQUIRED_MESSAGE = "Incident type is required.";
export const INCIDENT_SEVERITY_REQUIRED_MESSAGE = "Severity is required.";
export const INCIDENT_FUTURE_DATE_MESSAGE = "Cannot be in the future.";
export const INCIDENT_DATE_ORDER_MESSAGE = "Detected date cannot be before the occurred date.";
export const INCIDENT_MODEL_VERSION_TOO_LONG_MESSAGE =
  "Model / system version cannot exceed 255 characters.";

/** True when a YYYY-MM-DD date is after today (the user's local calendar day). */
export function isIncidentDateInFuture(value: unknown, today: Dayjs = dayjs()): boolean {
  return !!value && dayjs(value as string).isAfter(today, "day");
}

/**
 * Returns an error message for the detected date given the occurred date, or
 * "" when valid: it must not be in the future (unless `checkFuture` is false,
 * for an unchanged date in edit mode), and must be on or after the occurred
 * date (the server refuses both). Required is checked separately.
 */
export function validateIncidentDetectedDate(
  detected: unknown,
  occurred: unknown,
  { checkFuture = true, today = dayjs() }: { checkFuture?: boolean; today?: Dayjs } = {},
): string {
  if (!detected) return "";
  if (checkFuture && isIncidentDateInFuture(detected, today)) return INCIDENT_FUTURE_DATE_MESSAGE;
  if (occurred && dayjs(detected as string).isBefore(dayjs(occurred as string), "day")) {
    return INCIDENT_DATE_ORDER_MESSAGE;
  }
  return "";
}
