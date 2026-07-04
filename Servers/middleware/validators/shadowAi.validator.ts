import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

export const validateShadowAiIdParam = [idParam, handleValidationErrors];

export const validateUpdateToolStatus = [
  idParam,
  body("status")
    .isIn(["detected", "under_review", "approved", "restricted", "blocked", "dismissed"])
    .withMessage(
      "status must be one of: detected, under_review, approved, restricted, blocked, dismissed",
    ),
  handleValidationErrors,
];

export const validateStartGovernance = [
  idParam,
  body("model_inventory")
    .custom((v) => v && typeof v === "object" && !Array.isArray(v))
    .withMessage("model_inventory must be an object"),
  body("model_inventory.provider")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("model_inventory.provider is required"),
  body("model_inventory.model")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("model_inventory.model is required"),
  body("governance_owner_id")
    .custom((v) => {
      const n = typeof v === "number" ? v : parseInt(v, 10);
      return Number.isInteger(n) && n > 0;
    })
    .withMessage("governance_owner_id must be a positive integer"),
  body("start_lifecycle").optional({ nullable: true }).isBoolean(),
  handleValidationErrors,
];

export const validateCreateRule = [
  body("name").isString().trim().notEmpty().withMessage("name is required"),
  body("trigger_type").isString().trim().notEmpty().withMessage("trigger_type is required"),
  body("actions").isArray({ min: 1 }).withMessage("actions must be a non-empty array"),
  body("description").optional({ nullable: true }).isString(),
  body("is_active").optional({ nullable: true }).isBoolean(),
  body("trigger_config")
    .optional({ nullable: true })
    .custom((v) => v == null || (typeof v === "object" && !Array.isArray(v))),
  body("cooldown_minutes").optional({ nullable: true }).isInt({ min: 0 }),
  body("notification_user_ids").optional({ nullable: true }).isArray(),
  handleValidationErrors,
];

export const validateUpdateRule = [
  idParam,
  body("name").optional({ nullable: true }).isString().trim().notEmpty(),
  body("trigger_type").optional({ nullable: true }).isString().trim().notEmpty(),
  body("actions").optional({ nullable: true }).isArray(),
  body("is_active").optional({ nullable: true }).isBoolean(),
  body("cooldown_minutes").optional({ nullable: true }).isInt({ min: 0 }),
  handleValidationErrors,
];

const PARSER_TYPES = ["zscaler", "netskope", "squid", "generic_kv"];

export const validateCreateSyslogConfig = [
  body("source_identifier")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("source_identifier is required"),
  body("parser_type")
    .isIn(PARSER_TYPES)
    .withMessage(`parser_type must be one of: ${PARSER_TYPES.join(", ")}`),
  body("is_active").optional({ nullable: true }).isBoolean(),
  handleValidationErrors,
];

export const validateUpdateSyslogConfig = [
  idParam,
  body("source_identifier").optional({ nullable: true }).isString().trim().notEmpty(),
  body("parser_type").optional({ nullable: true }).isIn(PARSER_TYPES),
  body("is_active").optional({ nullable: true }).isBoolean(),
  handleValidationErrors,
];

export const validateUpdateSettings = [
  body("rate_limit_max_events_per_hour").optional({ nullable: true }).isInt({ min: 0 }),
  body("retention_events_days").optional({ nullable: true }).isInt({ min: 1, max: 3650 }),
  body("retention_daily_rollups_days").optional({ nullable: true }).isInt({ min: 1, max: 3650 }),
  body("retention_alert_history_days").optional({ nullable: true }).isInt({ min: 1, max: 3650 }),
  handleValidationErrors,
];
