import { check } from "express-validator";
import { handleValidationErrors } from "../../middleware/validate.middleware";

export const validateId = (paramName = "id") => [
  check(paramName).isInt({ min: 1 }).withMessage(`${paramName} must be a positive integer`),
  handleValidationErrors,
];

/**
 * Same check, but the field may be absent entirely — for an id that only
 * exists for some callers. A present value must still be a real id: this
 * accepts "not supplied", never 0 or "".
 */
export const validateOptionalId = (paramName = "id") => [
  check(paramName)
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage(`${paramName} must be a positive integer`),
  handleValidationErrors,
];
