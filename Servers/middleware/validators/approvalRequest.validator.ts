import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

export const validateCreateApprovalRequest = [
  body("request_name").isString().trim().notEmpty().withMessage("request_name is required"),
  body("workflow_id").isInt({ min: 1 }).withMessage("workflow_id must be a positive integer"),
  body("entity_id").optional({ nullable: true }).isInt({ min: 1 }),
  body("entity_type").optional({ nullable: true }).isString(),
  body("entity_data")
    .optional({ nullable: true })
    .custom((v) => typeof v === "object"),
  handleValidationErrors,
];

export const validateApprovalActionBody = [
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
  body("comments").optional({ nullable: true, checkFalsy: false }).isString(),
  handleValidationErrors,
];

export const validateApprovalIdParam = [
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
  handleValidationErrors,
];
