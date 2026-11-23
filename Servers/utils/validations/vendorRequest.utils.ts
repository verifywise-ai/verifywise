/**
 * Request checks for the vendor and vendor risk REST writes. Each throws a
 * ValidationException (400) for a value the database would reject (an enum
 * outside its list, text in an integer column, an over-long string) so the
 * caller gets a 400 naming the field instead of a 500 with the raw Postgres
 * error. Required fields on create stay with the models.
 */
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../database/db";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";
import { toId } from "./validation.utils";
import {
  VENDOR_BUSINESS_CRITICALITY_ENUM,
  VENDOR_DATA_SENSITIVITY_ENUM,
  VENDOR_PAST_ISSUES_ENUM,
  VENDOR_REGULATORY_EXPOSURE_ENUM,
} from "./vendorValidation.utils";

/** enum_vendors_review_status. 'Superseded' is set by the system, but the column allows it. */
const VENDOR_REVIEW_STATUSES = [
  "Not started",
  "In review",
  "Reviewed",
  "Requires follow-up",
  "Superseded",
] as const;

/** enum_vendorrisks_likelihood; "Almost Certain" is accepted and normalized on write. */
const VENDOR_RISK_LIKELIHOODS = ["rare", "unlikely", "possible", "likely", "almost certain"];

/** enum_vendorrisks_risk_severity. */
const VENDOR_RISK_SEVERITIES = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];

/** VARCHAR(255) columns. */
const SHORT_TEXT_MAX = 255;

/** Largest INTEGER (int4) value. */
const INT4_MAX = 2147483647;

/**
 * A string Postgres reads as a timestamptz: an ISO date (YYYY-MM-DD) whose
 * day exists, optionally followed by a time. Numbers and dates JavaScript
 * would roll over ("2026-02-30") are refused.
 */
const isTimestampString = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value.trim());
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayExists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return dayExists && Number.isFinite(Date.parse(value));
};

const invalid = (field: string, value: unknown): ValidationException =>
  new ValidationException(`Invalid value for ${field}`, field, value, {
    i18nKey: "Invalid value for {field}",
    i18nVars: { field },
  });

const required = (field: string): ValidationException =>
  new ValidationException(`${field} is required`, field, undefined, {
    i18nKey: "{field} is required",
    i18nVars: { field },
  });

/** '', null and undefined: the field is cleared or not sent. */
const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === "";

const assertObjectBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("body", body);
  return body as Record<string, unknown>;
};

const assertText = (
  body: Record<string, unknown>,
  field: string,
  options: { max?: number; nonEmpty?: boolean } = {},
): void => {
  const value = body[field];
  if (value === undefined) return;
  if (value === null || value === "") {
    if (options.nonEmpty) throw required(field);
    return;
  }
  if (typeof value !== "string") {
    throw new ValidationException(`${field} must be text`, field, value, {
      i18nKey: "{field} must be text",
      i18nVars: { field },
    });
  }
  const trimmed = value.trim();
  if (options.nonEmpty && trimmed.length === 0) throw required(field);
  // The model trims before writing, and VARCHAR counts characters, not UTF-16 units.
  if (options.max !== undefined && [...trimmed].length > options.max) {
    throw new ValidationException(
      `${field} must be at most ${options.max} characters`,
      field,
      value,
      {
        i18nKey: "{field} must be at most {max} characters",
        i18nVars: { field, max: options.max },
      },
    );
  }
};

const assertEnum = (
  body: Record<string, unknown>,
  field: string,
  allowed: readonly string[],
  options: { nonEmpty?: boolean; caseInsensitive?: boolean } = {},
): void => {
  const value = body[field];
  if (value === undefined) return;
  if (isEmpty(value)) {
    if (options.nonEmpty) throw required(field);
    return;
  }
  const candidate =
    options.caseInsensitive && typeof value === "string" ? value.trim().toLowerCase() : value;
  if (typeof candidate !== "string" || !allowed.includes(candidate)) throw invalid(field, value);
};

/** An id: a positive integer, or a string of digits. Empty passes unless nonEmpty. */
const assertId = (
  body: Record<string, unknown>,
  field: string,
  options: { nonEmpty?: boolean } = {},
): void => {
  const value = body[field];
  if (value === undefined) return;
  if (isEmpty(value)) {
    if (options.nonEmpty) throw required(field);
    return;
  }
  const id = toId(value);
  if (!Number.isInteger(id) || id <= 0) throw invalid(field, value);
};

/** A list of positive integer ids (numbers or digit strings). null means not sent. */
const assertIdList = (body: Record<string, unknown>, field: string): void => {
  const value = body[field];
  if (value === undefined || value === null) return;
  const ok =
    Array.isArray(value) &&
    value.every((v) => {
      const id = toId(v);
      return Number.isInteger(id) && id > 0;
    });
  if (!ok) {
    throw new ValidationException(`${field} must be a list of ids`, field, value, {
      i18nKey: "{field} must be a list of ids",
      i18nVars: { field },
    });
  }
};

/** The ids of a list `assertIdList` accepted, as numbers, without duplicates. */
export const toIdList = (value: unknown): number[] =>
  Array.isArray(value) ? Array.from(new Set(value.map((v) => toId(v)))) : [];

/**
 * Checks the fields of a vendor create or PATCH body that are present.
 * Absent fields are not checked: a PATCH changes only what it sends.
 */
export const assertVendorRequestBody = (rawBody: unknown): void => {
  const body = assertObjectBody(rawBody);
  assertText(body, "vendor_name", { max: SHORT_TEXT_MAX, nonEmpty: true });
  assertText(body, "vendor_provides", { nonEmpty: true });
  assertText(body, "website", { max: SHORT_TEXT_MAX, nonEmpty: true });
  assertText(body, "vendor_contact_person", { max: SHORT_TEXT_MAX, nonEmpty: true });
  assertText(body, "review_result", { max: SHORT_TEXT_MAX });
  assertEnum(body, "review_status", VENDOR_REVIEW_STATUSES);
  assertEnum(body, "data_sensitivity", VENDOR_DATA_SENSITIVITY_ENUM);
  assertEnum(body, "business_criticality", VENDOR_BUSINESS_CRITICALITY_ENUM);
  assertEnum(body, "past_issues", VENDOR_PAST_ISSUES_ENUM);
  assertEnum(body, "regulatory_exposure", VENDOR_REGULATORY_EXPOSURE_ENUM);
  // assignee and reviewer are checked where they are written
  // (assertVendorUsersInOrganization), which tells a non-id from an outsider.
  assertIdList(body, "projects");

  const orderNo = body.order_no;
  if (!isEmpty(orderNo)) {
    const n = toId(orderNo);
    if (!Number.isInteger(n) || Math.abs(n) > INT4_MAX) throw invalid("order_no", orderNo);
  }

  const reviewDate = body.review_date;
  if (!isEmpty(reviewDate) && !isTimestampString(reviewDate)) {
    throw invalid("review_date", reviewDate);
  }
};

/**
 * Checks the fields of a vendor risk create or PATCH body that are present.
 * On create, the fields the risk can't exist without are required.
 * vendor_id, risk_description, likelihood and risk_severity can't
 * be cleared; impact_description and action_plan can.
 */
export const assertVendorRiskRequestBody = (rawBody: unknown, mode: "create" | "update"): void => {
  const body = assertObjectBody(rawBody);
  if (mode === "create") {
    for (const field of ["vendor_id", "risk_description", "likelihood", "risk_severity"]) {
      if (isEmpty(body[field])) throw required(field);
    }
  }
  assertId(body, "vendor_id", { nonEmpty: true });
  assertText(body, "risk_description", { nonEmpty: true });
  assertText(body, "impact_description");
  assertText(body, "action_plan");
  assertEnum(body, "likelihood", VENDOR_RISK_LIKELIHOODS, {
    nonEmpty: true,
    caseInsensitive: true,
  });
  assertEnum(body, "risk_severity", VENDOR_RISK_SEVERITIES, { nonEmpty: true });
  // action_owner is checked where it is written (assertVendorRiskOwnerInOrganization).
  assertIdList(body, "frameworks");
};

/**
 * Every id in `frameworkIds` must be a framework. Run on the write's
 * transaction before the links are written, so an unknown id is a 400
 * instead of a foreign key error that aborts the transaction.
 */
export const assertFrameworksExist = async (
  frameworkIds: number[],
  transaction: Transaction,
): Promise<void> => {
  if (frameworkIds.length === 0) return;
  const rows = (await sequelize.query(`SELECT id FROM frameworks WHERE id IN (:ids)`, {
    replacements: { ids: frameworkIds },
    type: QueryTypes.SELECT,
    transaction,
  })) as { id: number }[];
  if (rows.length !== frameworkIds.length) throw invalid("frameworks", frameworkIds);
};

/** The `?filter=` of the vendor risk lists. Absent means "active". */
export type VendorRiskListFilter = "active" | "deleted" | "all";

/** The filter, or null when it is not one of active, deleted, all. */
export const parseVendorRiskListFilter = (value: unknown): VendorRiskListFilter | null => {
  if (value === undefined || value === "") return "active";
  return value === "active" || value === "deleted" || value === "all" ? value : null;
};

/** A positive integer route id, or null. "12abc", "1.5", "-3" and "" are null. */
export const parseRouteId = (value: unknown): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = toId(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};
