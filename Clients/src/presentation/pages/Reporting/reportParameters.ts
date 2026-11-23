/**
 * Report details (report parameters) for the run wizard: prefill, client-side
 * validation and the request body. Validation mirrors
 * Servers/services/reporting/reportParameters.ts (validateReportParameters) so
 * the wizard blocks what the server would answer with a 400.
 */
import type {
  LastReportParameters,
  ReportParameterField,
  ReportParameters,
} from "../../../domain/interfaces/i.reporting";

/** Keys a schedule never stores: each scheduled run derives its own period. */
export const PERIOD_KEYS = ["periodStart", "periodEnd"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The fields a stored parameters_config declares. The stored value is not
 * trusted to be well formed: fields that are not a list count as none, and an
 * entry that is not a field (no text key) is skipped, so a bad template opens
 * the wizard without a details step instead of crashing it.
 */
export function declaredFields(fields: unknown): ReportParameterField[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (f): f is ReportParameterField =>
      typeof f === "object" && f !== null && typeof (f as { key?: unknown }).key === "string",
  );
}

/** Today as YYYY-MM-DD in UTC, the day the server compares the period end with. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

const isRealDate = (s: string) => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Three months back with month-end clamping (31 May -> 28/29 Feb), then a day
// on, so the default period is three whole months ending on `end`.
const threeMonthsBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - 3;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)))
    .toISOString()
    .slice(0, 10);
};

/**
 * Starting answers for the declared fields: the previous run's answers first,
 * then the defaults for whatever it did not answer. Only declared keys are
 * returned, so an answer to a field the template no longer has is never sent.
 */
export function buildParameterPrefill(
  fields: ReportParameterField[],
  ctx: {
    last: LastReportParameters | null | undefined;
    organizationName: string;
    userFullName: string;
    today: string;
  },
): ReportParameters {
  const end = ctx.today;
  const afterLast = ctx.last?.periodEnd ? shiftDays(ctx.last.periodEnd, 1) : null;
  // A previous period that already reaches today leaves nothing to report on
  // from the day after it, so fall back to the default three months.
  const start = afterLast && afterLast <= end ? afterLast : shiftDays(threeMonthsBefore(end), 1);
  const defaults: ReportParameters = {
    periodStart: start,
    periodEnd: end,
    institutionName: ctx.organizationName,
    preparedByName: ctx.userFullName,
    audience: "osfi",
    isFinal: false,
  };
  const last = ctx.last?.parameters ?? {};
  const prefill: ReportParameters = {};
  for (const field of fields) {
    const fromLast = last[field.key];
    const value = fromLast !== undefined && fromLast !== "" ? fromLast : defaults[field.key];
    if (field.type === "boolean") prefill[field.key] = typeof value === "boolean" ? value : false;
    else if (field.type === "select") {
      const allowed = (field.options ?? []).some((o) => o.value === value);
      prefill[field.key] = allowed ? String(value) : "";
    } else prefill[field.key] = typeof value === "string" ? value : "";
  }
  return prefill;
}

/**
 * Field errors keyed by field, with the server's messages. An empty object
 * means the answers would pass the server's check. `requirePeriod` is false
 * for a schedule, whose period is set at run time.
 */
export function validateParameters(
  fields: ReportParameterField[],
  values: ReportParameters,
  opts: { today: string; requirePeriod: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {};
  const checked = fields.filter((f) => opts.requirePeriod || !PERIOD_KEYS.includes(f.key));

  for (const field of checked) {
    if (field.type === "boolean") continue;
    const raw = values[field.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      continue;
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      errors[field.key] = `${field.label} must be at most ${field.maxLength} characters`;
    } else if (field.type === "date" && !isRealDate(value)) {
      errors[field.key] = `${field.label} must be a valid date (YYYY-MM-DD)`;
    } else if (field.type === "select" && !(field.options ?? []).some((o) => o.value === value)) {
      errors[field.key] = `${field.label} must be one of the listed options`;
    }
  }

  const endField = checked.find((f) => f.key === "periodEnd");
  const start = values.periodStart;
  const end = values.periodEnd;
  if (endField && !errors.periodEnd && typeof end === "string" && isRealDate(end)) {
    if (end > opts.today) errors.periodEnd = `${endField.label} cannot be in the future`;
    else if (
      !errors.periodStart &&
      typeof start === "string" &&
      isRealDate(start) &&
      checked.some((f) => f.key === "periodStart") &&
      end < start
    ) {
      errors.periodEnd = `${endField.label} must be on or after the period start`;
    }
  }
  return errors;
}

/** The reportParameters body: declared keys only, text trimmed, no period for a schedule. */
export function toRequestParameters(
  fields: ReportParameterField[],
  values: ReportParameters,
  requirePeriod: boolean,
): ReportParameters {
  const out: ReportParameters = {};
  for (const field of fields) {
    if (!requirePeriod && PERIOD_KEYS.includes(field.key)) continue;
    const v = values[field.key];
    if (field.type === "boolean") out[field.key] = v === true;
    else out[field.key] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}

/**
 * The server's own words for a failed report write: a 400 carries
 * `{ data: { errors: [...] } }` (report details, schedule) or a single
 * message string. Anything else gets the caller's fallback.
 */
export function reportRequestErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { status?: number; response?: { data?: unknown } } | null)?.response;
  const status = (error as { status?: number } | null)?.status;
  if (status === undefined || status >= 500) return fallback;
  const data = response?.data as { errors?: unknown } | string | undefined;
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object" && Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map(String).join(" ");
  }
  return fallback;
}
