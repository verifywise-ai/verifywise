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
import { kindViolations } from "./sectionCatalog";
import { E23_KIND } from "./e23/e23Parameters";

/** Report kinds a template version may declare in parameters_config.kind. */
export const KNOWN_REPORT_KINDS: readonly string[] = [E23_KIND];

/** An absent kind is a general report; any other value must be a known kind. */
export function reportKindErrors(
  config: ReportParametersConfig | null | undefined,
): ReportParameterError[] {
  const kind = config?.kind;
  if (kind === undefined || kind === null || KNOWN_REPORT_KINDS.includes(kind)) return [];
  return [{ key: "kind", message: "unknown report kind: {kind}", params: { kind: String(kind) } }];
}

export interface ReportParameterError {
  key: string;
  message: string;
  params?: Record<string, string | number>;
}

const FIELD_TYPES: readonly string[] = ["date", "text", "textarea", "select", "boolean"];

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The problems of one declared field; `name` is its key, or its position without one. */
function fieldConfigErrors(f: Record<string, unknown>, position: number): ReportParameterError[] {
  const errors: ReportParameterError[] = [];
  const name = isText(f.key) ? f.key : String(position);
  if (!isText(f.key)) {
    errors.push({ key: "fields", message: "parameter field {name} needs a key", params: { name } });
  }
  if (!isText(f.label)) {
    errors.push({
      key: "fields",
      message: "parameter field {name} needs a label",
      params: { name },
    });
  }
  if (!FIELD_TYPES.includes(f.type as string)) {
    errors.push({
      key: "fields",
      message: "parameter field {name} has an unknown type: {type}",
      params: { name, type: String(f.type) },
    });
  } else if (f.type === "select") {
    if (!Array.isArray(f.options)) {
      errors.push({
        key: "fields",
        message: "parameter field {name} needs a list of options",
        params: { name },
      });
    } else if (!f.options.every((o) => isObject(o) && isText(o.value) && isText(o.label))) {
      errors.push({
        key: "fields",
        message: "parameter field {name} has an option without a text value and label",
        params: { name },
      });
    }
  }
  return errors;
}

/**
 * Checks a template version's parameters_config at write time. A malformed
 * declaration would otherwise fail every run of the template (a 500 on
 * run-now, a skipped scheduler tick) and break the run wizard. Absent means a
 * general report with no parameters.
 */
export function parametersConfigErrors(config: unknown): ReportParameterError[] {
  if (config === undefined || config === null) return [];
  if (!isObject(config)) {
    return [{ key: "parameters_config", message: "parameters config must be an object" }];
  }
  const errors = reportKindErrors(config as ReportParametersConfig);
  const fields = config.fields;
  if (fields === undefined || fields === null) return errors;
  if (!Array.isArray(fields)) {
    return [...errors, { key: "fields", message: "parameters config fields must be a list" }];
  }
  const seen = new Set<string>();
  const repeated = new Set<string>();
  fields.forEach((f, i) => {
    const position = i + 1;
    if (!isObject(f)) {
      errors.push({
        key: "fields",
        message: "parameter field {name} must be an object",
        params: { name: String(position) },
      });
      return;
    }
    errors.push(...fieldConfigErrors(f, position));
    if (isText(f.key)) {
      if (seen.has(f.key)) repeated.add(f.key);
      seen.add(f.key);
    }
  });
  for (const key of repeated) {
    errors.push({
      key: "fields",
      message: "parameter field key {name} is used more than once",
      params: { name: key },
    });
  }
  return errors;
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

/** True when a template version asks for parameters (a report kind, or declared fields). */
export function declaresParameters(config: ReportParametersConfig | null | undefined): boolean {
  return !!config?.kind || (config?.fields?.length ?? 0) > 0;
}

/** The section keys a sections_config lists, for the report-kind check. */
export function sectionKeysOf(sectionsConfig: unknown): string[] {
  const sections = (sectionsConfig as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .map((s) => (s as { reportSectionKey?: unknown })?.reportSectionKey)
    .filter((k): k is string => typeof k === "string");
}

/**
 * Everything a run or schedule request must pass before it is accepted:
 * sections limited to another report kind are refused, and the parameters are
 * checked against the version's declared fields. A version that declares
 * parameters but receives none is validated as `{}`, so the caller gets the
 * required-field errors rather than a report with a blank cover.
 */
export function validateRunInput(
  config: ReportParametersConfig | null | undefined,
  sectionKeys: string[],
  raw: unknown,
  opts: { now: Date; requirePeriod: boolean; scope?: string },
): { value: ReportParameters; errors: ReportParameterError[] } {
  const cfg = config ?? {};
  const errors: ReportParameterError[] = kindViolations(sectionKeys, cfg.kind).map((key) => ({
    key,
    message: "section {key} is only available in an OSFI E-23 report",
    params: { key },
  }));
  // The E-23 report describes the institution's whole model risk programme;
  // a project slice of it would read as complete while leaving models out.
  if (cfg.kind === E23_KIND && opts.scope !== undefined && opts.scope !== "organization") {
    errors.push({
      key: "scope",
      message: "an OSFI E-23 report covers the whole organization; choose organization scope",
    });
  }
  if ((raw === undefined || raw === null) && !declaresParameters(cfg)) {
    return { value: {}, errors };
  }
  const result = validateReportParameters(cfg, raw ?? {}, opts);
  return { value: result.value, errors: [...errors, ...result.errors] };
}

/**
 * Every message a parameter or report-kind error can carry. They are
 * translation keys; listing them here is what lets the i18n scanner see them
 * through parameterErrorMessages (it cannot follow e.message out of an array).
 * A message added to the validators must be added here too, or it is sent
 * untranslated.
 */
export const PARAMETER_MESSAGES = [
  "{label} is required",
  "{label} must be true or false",
  "{label} must be text",
  "{label} must be at most {max} characters",
  "{label} must be a valid date (YYYY-MM-DD)",
  "{label} must be one of the listed options",
  "{label} cannot be in the future",
  "{label} must be on or after the period start",
  "unknown report parameter: {key}",
  "report parameters must be an object",
  "the reporting period is set at run time for schedules",
  "section {key} is only available in an OSFI E-23 report",
  "an OSFI E-23 report covers the whole organization; choose organization scope",
  "unknown report kind: {kind}",
  "parameters config must be an object",
  "parameters config fields must be a list",
  "parameter field {name} must be an object",
  "parameter field {name} needs a key",
  "parameter field {name} needs a label",
  "parameter field {name} has an unknown type: {type}",
  "parameter field {name} needs a list of options",
  "parameter field {name} has an option without a text value and label",
  "parameter field key {name} is used more than once",
] as const;

const fill = (text: string, params?: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? String(params[k]) : m));

/**
 * Turns parameter errors into messages. With a request translator the English
 * key is translated; without one (tests, internal callers) the placeholders
 * are filled into the English text.
 */
export function parameterErrorMessages(
  errors: ReportParameterError[],
  t?: (key: string, vars?: Record<string, string | number>) => string,
): string[] {
  return errors.map((e) => {
    const key = PARAMETER_MESSAGES.find((m) => m === e.message);
    return t && key ? t(key, e.params) : fill(e.message, e.params);
  });
}
