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
  body("override").optional().isBoolean({ strict: true }).withMessage("override must be a boolean"),
  body("step_number")
    .if(body("override").equals("true"))
    .isInt({ min: 1 })
    .withMessage("step_number must be a positive integer when override is set"),
  body("comments")
    .if(body("override").equals("true"))
    .custom((v) => typeof v === "string" && v.trim().length > 0)
    .withMessage("comments must explain the override"),
  handleValidationErrors,
];

export const validateApprovalIdParam = [
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
  handleValidationErrors,
];
