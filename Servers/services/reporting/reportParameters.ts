/**
 * @fileoverview Validation of report parameter values against a template
 * version's declared fields. Error messages are English translation keys with
 * {placeholders}; controllers translate them.
 *
 * @module services/reporting/reportParameters
 */

import type {
  ReportParameterField,
  ReportParameters,
  ReportParametersConfig,
} from "../../domain.layer/interfaces/i.reportTemplate";

export interface ReportParameterError {
  key: string;
  message: string;
  params?: Record<string, string | number>;
}

const PERIOD_KEYS = ["periodStart", "periodEnd"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateField(
  field: ReportParameterField,
  raw: unknown,
  errors: ReportParameterError[],
): string | boolean | undefined {
  const { key, label } = field;
  const missing =
    raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");

  if (field.type === "boolean") {
    if (raw === undefined || raw === null) {
      if (field.required) errors.push({ key, message: "{label} is required", params: { label } });
      return undefined;
    }
    if (typeof raw !== "boolean") {
      errors.push({ key, message: "{label} must be true or false", params: { label } });
      return undefined;
    }
    return raw;
  }

  if (missing) {
    if (field.required) errors.push({ key, message: "{label} is required", params: { label } });
    return undefined;
  }
  if (typeof raw !== "string") {
    errors.push({ key, message: "{label} must be text", params: { label } });
    return undefined;
  }
  const value = raw.trim();

  if (field.maxLength !== undefined && value.length > field.maxLength) {
    errors.push({
      key,
      message: "{label} must be at most {max} characters",
      params: { label, max: field.maxLength },
    });
    return undefined;
  }
  if (field.type === "date" && !isRealDate(value)) {
    errors.push({ key, message: "{label} must be a valid date (YYYY-MM-DD)", params: { label } });
    return undefined;
  }
  if (field.type === "select" && !(field.options ?? []).some((o) => o.value === value)) {
    errors.push({ key, message: "{label} must be one of the listed options", params: { label } });
    return undefined;
  }
  return value;
}

export function validateReportParameters(
  config: ReportParametersConfig,
  raw: unknown,
  opts: { now: Date; requirePeriod: boolean },
): { value: ReportParameters; errors: ReportParameterError[] } {
  const errors: ReportParameterError[] = [];
  const value: ReportParameters = {};

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      value,
      errors: [{ key: "", message: "report parameters must be an object" }],
    };
  }
  const input = raw as Record<string, unknown>;
  const allFields = config.fields ?? [];
  const known = new Set(allFields.map((f) => f.key));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) {
      errors.push({ key, message: "unknown report parameter: {key}", params: { key } });
    }
  }

  const fields = allFields.filter((f) => opts.requirePeriod || !PERIOD_KEYS.includes(f.key));
  if (!opts.requirePeriod) {
    for (const key of PERIOD_KEYS) {
      if (known.has(key) && input[key] !== undefined) {
        errors.push({ key, message: "the reporting period is set at run time for schedules" });
      }
    }
  }

  for (const field of fields) {
    const v = validateField(field, input[field.key], errors);
    if (v !== undefined) value[field.key] = v;
  }

  const start = value.periodStart;
  const end = value.periodEnd;
  const today = opts.now.toISOString().slice(0, 10);
  if (typeof end === "string" && end > today) {
    errors.push({
      key: "periodEnd",
      message: "{label} cannot be in the future",
      params: { label: allFields.find((f) => f.key === "periodEnd")?.label ?? "periodEnd" },
    });
  } else if (typeof start === "string" && typeof end === "string" && end < start) {
    errors.push({
      key: "periodEnd",
      message: "{label} must be on or after the period start",
      params: { label: allFields.find((f) => f.key === "periodEnd")?.label ?? "periodEnd" },
    });
  }

  return { value, errors };
}
