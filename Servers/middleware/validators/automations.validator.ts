import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

export const validateAutomationIdParam = [idParam, handleValidationErrors];

export const validateTriggerIdParam = [
  param("triggerId").isInt({ min: 1 }).withMessage("triggerId must be a positive integer"),
  handleValidationErrors,
];

export const validateCreateAutomation = [
  body("triggerId").isInt({ min: 1 }).withMessage("triggerId must be a positive integer"),
  body("name").isString().trim().notEmpty().withMessage("name is required"),
  body("actions").isArray({ min: 1 }).withMessage("actions must be a non-empty array"),
  body("params")
    .optional({ nullable: true })
    .custom((v) => typeof v === "string" || typeof v === "object")
    .withMessage("params must be a JSON string or object"),
  handleValidationErrors,
];

export const validateUpdateAutomation = [
  idParam,
  body("name").optional().isString().trim().notEmpty(),
  body("is_active").optional().isBoolean(),
  body("triggerId").optional().isInt({ min: 1 }),
  body("actions").optional().isArray(),
  body("params")
    .optional({ nullable: true })
    .custom((v) => typeof v === "string" || typeof v === "object"),
  handleValidationErrors,
];

export const validateHistoryQuery = [
  idParam,
  query("limit").optional().isInt({ min: 1, max: 1000 }),
  query("offset").optional().isInt({ min: 0 }),
  handleValidationErrors,
];
