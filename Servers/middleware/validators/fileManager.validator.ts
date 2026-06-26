import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

export const validateFileIdParam = [idParam, handleValidationErrors];

export const validateUpdateFileMetadata = [
  idParam,
  body("tags")
    .optional({ nullable: true })
    .custom((v) => Array.isArray(v) && v.every((t) => typeof t === "string"))
    .withMessage("tags must be an array of strings"),
  body("review_status")
    .optional({ nullable: true })
    .isIn(["draft", "pending_review", "approved", "rejected", "expired", "superseded"])
    .withMessage(
      "review_status must be one of: draft, pending_review, approved, rejected, expired, superseded",
    ),
  body("version")
    .optional({ nullable: true })
    .matches(/^[0-9]+\.[0-9]+(\.[0-9]+)?$/)
    .withMessage("version must match X.Y or X.Y.Z"),
  body("expiry_date")
    .optional({ nullable: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("expiry_date must be YYYY-MM-DD"),
  body("description")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage("description must be a string up to 2000 characters"),
  handleValidationErrors,
];

export const validateFileSearchQuery = [
  query("q").isString().trim().notEmpty().withMessage("q query parameter is required"),
  query("page").optional().isInt({ min: 1 }),
  query("pageSize").optional().isInt({ min: 1, max: 200 }),
  handleValidationErrors,
];

export const validatePaginationQuery = [
  query("page").optional().isInt({ min: 1 }),
  query("pageSize").optional().isInt({ min: 1, max: 200 }),
  handleValidationErrors,
];
