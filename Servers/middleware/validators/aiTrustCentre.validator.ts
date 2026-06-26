import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");
const hashParam = param("hash")
  .isString()
  .isLength({ min: 1, max: 256 })
  .withMessage("hash must be a non-empty string");

export const validateAITrustHashParam = [hashParam, handleValidationErrors];

export const validateAITrustHashWithIdParam = [hashParam, idParam, handleValidationErrors];

export const validateCreateAITrustResource = [
  body("name").isString().trim().notEmpty().withMessage("name is required"),
  body("description").optional({ nullable: true }).isString(),
  body("visible")
    .optional({ nullable: true })
    .custom((v) => typeof v === "string" || typeof v === "boolean"),
  handleValidationErrors,
];

export const validateUpdateAITrustResource = [
  idParam,
  body("name").optional({ nullable: true }).isString().trim().notEmpty(),
  body("description").optional({ nullable: true }).isString(),
  body("visible")
    .optional({ nullable: true })
    .custom((v) => typeof v === "string" || typeof v === "boolean"),
  handleValidationErrors,
];

export const validateCreateAITrustSubprocessor = [
  body("name").isString().trim().notEmpty().withMessage("name is required"),
  body("purpose").optional({ nullable: true }).isString(),
  body("location").optional({ nullable: true }).isString(),
  body("url")
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage("url must be a valid URL"),
  handleValidationErrors,
];

export const validateUpdateAITrustSubprocessor = [
  idParam,
  body("name").optional({ nullable: true }).isString().trim().notEmpty(),
  body("purpose").optional({ nullable: true }).isString(),
  body("location").optional({ nullable: true }).isString(),
  body("url").optional({ nullable: true, checkFalsy: true }).isURL(),
  handleValidationErrors,
];

export const validateUpdateAITrustOverview = [
  body()
    .custom((v) => v !== null && typeof v === "object" && !Array.isArray(v))
    .withMessage("request body must be an object"),
  handleValidationErrors,
];
