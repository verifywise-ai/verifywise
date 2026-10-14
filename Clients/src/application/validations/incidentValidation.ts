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
