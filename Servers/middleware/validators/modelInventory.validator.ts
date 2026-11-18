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
 * - The legacy routes keep accepting what they accepted; their bad enum or
 *   date values, which used to fail in the database with a 500, answer 400
 *   in the controllers.
 *
 * `is_demo` is not validated: no route takes it from the body.
 */
import { body, param, ValidationChain } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";
import { ModelInventoryStatus } from "../../domain.layer/enums/model-inventory-status.enum";
import { ModelInventoryType } from "../../domain.layer/enums/model-inventory-type.enum";
import { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import { ModelRiskStatus } from "../../domain.layer/enums/model-risk-status.enum";

const MAX_ID = 2147483647;
const oneOf = (field: string, values: string[]) => `${field} must be one of: ${values.join(", ")}`;

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

/** isInt checks array elements one by one, so [5] would pass it: refuse non-scalars. */
const isScalar = (value: unknown) => typeof value === "number" || typeof value === "string";

/** "", 0 and null mean "none"; anything else must be a positive integer. */
const optionalRefId = (field: string) =>
  body(field)
    .optional({ values: "falsy" })
    .custom(isScalar)
    .withMessage(`${field} must be a positive integer`)
    .bail()
    .isInt({ min: 1, max: MAX_ID })
    .withMessage(`${field} must be a positive integer`);

const requiredRefId = (field: string, message: string) =>
  body(field)
    .custom(isScalar)
    .withMessage(message)
    .bail()
    .isInt({ min: 1, max: MAX_ID })
    .withMessage(message);

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
  body("status").optional().isIn(MODEL_STATUSES).withMessage(oneOf("status", MODEL_STATUSES)),
  body("status_date")
    .optional()
    .isISO8601()
    .withMessage("status_date must be a valid ISO 8601 date"),
  optionalRefId("approver"),
  // "" or null: unclassified.
  body("type")
    .optional({ values: "falsy" })
    .isIn(MODEL_TYPES)
    .withMessage(oneOf("type", MODEL_TYPES)),
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

const optionalModelRiskFields: ValidationChain[] = [
  body("status").optional().isIn(RISK_STATUSES).withMessage(oneOf("status", RISK_STATUSES)),
  // "" or null: no model.
  optionalRefId("model_id"),
  ...[
    "description",
    "mitigation_plan",
    "impact",
    "likelihood",
    "key_metrics",
    "current_values",
    "threshold",
  ].map(optionalText),
];

export const validateCreateModelRiskV1 = [
  requiredText("risk_name"),
  body("risk_category")
    .isIn(RISK_CATEGORIES)
    .withMessage(`risk_category is required and must be one of: ${RISK_CATEGORIES.join(", ")}`),
  body("risk_level")
    .isIn(RISK_LEVELS)
    .withMessage(`risk_level is required and must be one of: ${RISK_LEVELS.join(", ")}`),
  requiredRefId("owner", "owner is required and must be a positive integer"),
  body("target_date")
    .isISO8601()
    .withMessage("target_date is required and must be a valid ISO 8601 date"),
  ...optionalModelRiskFields,
  handleValidationErrors,
];

export const validateUpdateModelRiskV1 = [
  param("id").isInt({ min: 1, max: MAX_ID }).withMessage("id must be a positive integer"),
  nonEmptyTextIfSent("risk_name"),
  body("risk_category")
    .optional()
    .isIn(RISK_CATEGORIES)
    .withMessage(oneOf("risk_category", RISK_CATEGORIES)),
  body("risk_level").optional().isIn(RISK_LEVELS).withMessage(oneOf("risk_level", RISK_LEVELS)),
  requiredRefId("owner", "owner must be a positive integer").optional(),
  body("target_date")
    .optional()
    .isISO8601()
    .withMessage("target_date must be a valid ISO 8601 date"),
  ...optionalModelRiskFields,
  handleValidationErrors,
];
