import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

/**
 * Accepts missing/null params, a plain object, or a JSON string.
 * On success, normalizes `req.body.params` to a plain object so controllers
 * never need to JSON.parse again.
 *
 * The sanitizer must not throw — express-validator runs sanitizers even when
 * a prior custom validator fails, and an uncaught throw becomes a 500.
 */
const paramsBody = body("params")
  .optional({ nullable: true })
  .custom((value) => {
    if (value == null || value === "") {
      return true;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return true;
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          return true;
        }
        throw new Error("params must be a JSON object");
      } catch (err) {
        if (err instanceof Error && err.message === "params must be a JSON object") {
          throw err;
        }
        throw new Error("params must be valid JSON");
      }
    }
    throw new Error("params must be a JSON string or object");
  })
  .customSanitizer((value) => {
    if (value == null || value === "") {
      return {};
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Leave the invalid value in place; .custom() already recorded the error.
      }
    }
    return value;
  });

export const validateAutomationIdParam = [idParam, handleValidationErrors];

export const validateTriggerIdParam = [
  param("triggerId").isInt({ min: 1 }).withMessage("triggerId must be a positive integer"),
  handleValidationErrors,
];

export const validateCreateAutomation = [
  body("triggerId").isInt({ min: 1 }).withMessage("triggerId must be a positive integer"),
  body("name").isString().trim().notEmpty().withMessage("name is required"),
  body("actions").isArray({ min: 1 }).withMessage("actions must be a non-empty array"),
  paramsBody,
  handleValidationErrors,
];

export const validateUpdateAutomation = [
  idParam,
  body("name").optional().isString().trim().notEmpty(),
  body("is_active").optional().isBoolean(),
  body("triggerId").optional().isInt({ min: 1 }),
  body("actions").optional().isArray(),
  paramsBody,
  handleValidationErrors,
];

export const validateHistoryQuery = [
  idParam,
  query("limit").optional().isInt({ min: 1, max: 1000 }),
  query("offset").optional().isInt({ min: 0 }),
  handleValidationErrors,
];
