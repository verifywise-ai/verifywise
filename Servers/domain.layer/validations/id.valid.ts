import { check } from "express-validator";
import { handleValidationErrors } from "../../middleware/validate.middleware";

export const validateId = (paramName = "id") => [
  check(paramName).isInt({ min: 1 }).withMessage(`${paramName} must be a positive integer`),
  handleValidationErrors,
];
