/**
 * Request validation for models and model risks (audit M-M7, M-M10, M-L1).
 *
 * - `validateModelIdParam` guards every `/:id` route, legacy and v1: a
 *   non-numeric id is a 400, not a database error.
 * - The v1 chains are strict: required fields, enum values, ISO dates and
 *   integer ids, with one message per field. The required set is the create
 *   form's (`NewModelInventory`, `NewModelRisk`), minus the fields the server
 *   defaults (a model's status and status date, a model risk's status), so
 *   the form never sends a body v1 refuses.
 * - A model risk's likelihood and severity are list labels; the service
 *   sets the level from them (decision 10), so v1 asks for both on create
 *   and no longer for `risk_level` (still checked when sent).
 * - The legacy routes have no validator chain; their bad enum or date
 *   values, which used to fail in the database with a 500, answer 400 in
 *   the controllers. They share the services, so the approval rule
 *   (decision 9) and the likelihood × severity formula with its label
 *   check (decision 10) apply to them too.
 *
 * `is_demo` is not validated: no route takes it from the body.
 */
import { body, param, ValidationChain } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";
import { toPositiveId } from "../../utils/modelReferences.utils";
import { ModelInventoryStatus } from "../../domain.layer/enums/model-inventory-status.enum";
import { ModelInventoryType } from "../../domain.layer/enums/model-inventory-type.enum";
import { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import { ModelRiskStatus } from "../../domain.layer/enums/model-risk-status.enum";
import { LIKELIHOOD_SCALE, SEVERITY_SCALE } from "../../utils/riskLevel.utils";

const MAX_ID = 2147483647;
const oneOf = (field: string, values: string[]) => `${field} must be one of: ${values.join(", ")}`;

/** One of `values`, as a string: isIn alone accepts ["Approved"], element by element. */
const isOneOf = (chain: ValidationChain, values: string[], message: string) =>
  chain.isString().withMessage(message).bail().isIn(values).withMessage(message);

export const validateModelIdParam = [
  param("id").isInt({ min: 1, max: MAX_ID }).withMessage("id must be a positive integer"),
  handleValidationErrors,
];

const requiredText = (field: string) =>
  body(field)
    .isString()
    .withMessage(`${field} is required and must be a non-empty string`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${field} is required and must be a non-empty string`);

/** Present → a non-empty string; absent → fine (updates). */
const nonEmptyTextIfSent = (field: string) =>
  body(field)
    .optional()
    .isString()
    .withMessage(`${field} must be a non-empty string`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${field} must be a non-empty string`);

const optionalText = (field: string) =>
  body(field).optional({ values: "null" }).isString().withMessage(`${field} must be a string`);

/**
 * A positive int32 id, as a number or a string of digits without leading
 * zeros: the house parser (toPositiveId), so the validator, the membership
 * check and the write read the value the same way. isInt alone would accept
 * [5] (element by element), "07" and "+5".
 */
const isRefId = (value: unknown) => toPositiveId(value) !== null;

/** "" and null mean "none"; anything else must be a positive integer id. */
const optionalRefId = (field: string) =>
  body(field)
    .optional({ values: "null" })
    .custom((value) => value === "" || isRefId(value))
    .withMessage(`${field} must be a positive integer`);

const requiredRefId = (field: string, message: string) =>
  body(field).custom(isRefId).withMessage(message);

const idList = (field: string): ValidationChain[] => [
  body(field)
    .optional({ values: "null" })
    .isArray()
    .withMessage(`${field} must be an array of ids`),
  body(`${field}.*`)
    .isInt({ min: 1, max: MAX_ID })
    .withMessage(`each of ${field} must be a positive integer`),
];

// ── Models ────────────────────────────────────────────────────────────────

const MODEL_STATUSES = Object.values(ModelInventoryStatus) as string[];
const MODEL_TYPES = Object.values(ModelInventoryType) as string[];

const optionalModelFields: ValidationChain[] = [
  isOneOf(body("status").optional(), MODEL_STATUSES, oneOf("status", MODEL_STATUSES)),
  body("status_date")
    .optional()
    .isISO8601()
    .withMessage("status_date must be a valid ISO 8601 date"),
  optionalRefId("approver"),
  // "" or null: unclassified.
  isOneOf(body("type").optional({ values: "falsy" }), MODEL_TYPES, oneOf("type", MODEL_TYPES)),
  body("capabilities")
    .optional({ values: "null" })
    .custom((value) => {
      const ok =
        typeof value === "string" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"));
      if (!ok) throw new Error("capabilities must be a string or an array of strings");
      return true;
    }),
  body("security_assessment")
    .optional({ values: "null" })
    .isBoolean({ strict: true })
    .withMessage("security_assessment must be a boolean"),
  body("security_assessment_data")
    .optional({ values: "null" })
    .isArray()
    .withMessage("security_assessment_data must be an array"),
  ...[
    "provider_model",
    "reference_link",
    "biases",
    "limitations",
    "hosting_provider",
    "intended_use",
    "external_key",
  ].map(optionalText),
  ...idList("projects"),
  ...idList("frameworks"),
];

export const validateCreateModelInventoryV1 = [
  requiredText("provider"),
  requiredText("model"),
  requiredText("version"),
  ...optionalModelFields,
  handleValidationErrors,
];

export const validateUpdateModelInventoryV1 = [
  param("id").isInt({ min: 1, max: MAX_ID }).withMessage("id must be a positive integer"),
  nonEmptyTextIfSent("provider"),
  nonEmptyTextIfSent("model"),
  nonEmptyTextIfSent("version"),
  ...optionalModelFields,
  body("deleteProjects")
    .optional()
    .isBoolean({ strict: true })
    .withMessage("deleteProjects must be a boolean"),
  body("deleteFrameworks")
    .optional()
    .isBoolean({ strict: true })
    .withMessage("deleteFrameworks must be a boolean"),
  handleValidationErrors,
];

// ── Model risks ───────────────────────────────────────────────────────────

const RISK_CATEGORIES = Object.values(ModelRiskCategory) as string[];
const RISK_LEVELS = Object.values(ModelRiskLevel) as string[];
const RISK_STATUSES = Object.values(ModelRiskStatus) as string[];
const LIKELIHOODS = Object.keys(LIKELIHOOD_SCALE);
const SEVERITIES = Object.keys(SEVERITY_SCALE);

const optionalModelRiskFields: ValidationChain[] = [
  isOneOf(body("status").optional(), RISK_STATUSES, oneOf("status", RISK_STATUSES)),
  // "" or null: no model.
  optionalRefId("model_id"),
  ...["description", "mitigation_plan", "impact", "key_metrics", "current_values", "threshold"].map(
    optionalText,
  ),
];

export const validateCreateModelRiskV1 = [
  requiredText("risk_name"),
  isOneOf(
    body("risk_category"),
    RISK_CATEGORIES,
    `risk_category is required and must be one of: ${RISK_CATEGORIES.join(", ")}`,
  ),
  isOneOf(
    body("likelihood"),
    LIKELIHOODS,
    `likelihood is required and must be one of: ${LIKELIHOODS.join(", ")}`,
  ),
  isOneOf(
    body("severity"),
    SEVERITIES,
    `severity is required and must be one of: ${SEVERITIES.join(", ")}`,
  ),
  // Computed from likelihood and severity; a sent value must still be valid.
  isOneOf(body("risk_level").optional(), RISK_LEVELS, oneOf("risk_level", RISK_LEVELS)),
  requiredRefId("owner", "owner is required and must be a positive integer"),
  // Optional, like the other mitigation fields: empty ("" or null) means none.
  body("target_date")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("target_date must be a valid ISO 8601 date"),
  ...optionalModelRiskFields,
  handleValidationErrors,
];

/**
 * On update a likelihood or severity may be cleared (null or ""); the level
 * then stays as stored. Anything else must be on the list.
 */
const clearableListValue = (field: string, values: string[]) =>
  body(field)
    .optional({ values: "null" })
    .custom((value) => value === "" || (typeof value === "string" && values.includes(value)))
    .withMessage(`${oneOf(field, values)}, or null or "" to clear it`);

export const validateUpdateModelRiskV1 = [
  param("id").isInt({ min: 1, max: MAX_ID }).withMessage("id must be a positive integer"),
  nonEmptyTextIfSent("risk_name"),
  isOneOf(
    body("risk_category").optional(),
    RISK_CATEGORIES,
    oneOf("risk_category", RISK_CATEGORIES),
  ),
  clearableListValue("likelihood", LIKELIHOODS),
  clearableListValue("severity", SEVERITIES),
  isOneOf(body("risk_level").optional(), RISK_LEVELS, oneOf("risk_level", RISK_LEVELS)),
  requiredRefId("owner", "owner must be a positive integer").optional(),
  // An emptied date ("" or null) clears it.
  body("target_date")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("target_date must be a valid ISO 8601 date"),
  ...optionalModelRiskFields,
  handleValidationErrors,
];
