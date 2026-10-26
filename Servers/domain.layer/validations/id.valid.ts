import { check, param } from "express-validator";
import { handleValidationErrors } from "../../middleware/validate.middleware";

/**
 * Largest value a Postgres INTEGER / SERIAL column holds. Every id these
 * validators guard is one, so a larger id can match no row; without the bound
 * it reached the query and failed there with a 500 instead of a 400.
 */
export const MAX_INT4_ID = 2147483647;

const ID_RANGE = { min: 1, max: MAX_INT4_ID };

export const validateId = (paramName = "id") => [
  check(paramName).isInt(ID_RANGE).withMessage(`${paramName} must be a positive integer`),
  handleValidationErrors,
];

/**
 * The same bound on a path parameter only, as a bare chain for callers that
 * run it themselves (router.param).
 */
export const idParamCheck = (paramName = "id") =>
  param(paramName).isInt(ID_RANGE).withMessage(`${paramName} must be a positive integer`);

/**
 * Same check, but the field may be absent entirely — for an id that only
 * exists for some callers. A present value must still be a real id: this
 * accepts "not supplied", never 0 or "".
 */
export const validateOptionalId = (paramName = "id") => [
  check(paramName)
    .optional({ nullable: true })
    .isInt(ID_RANGE)
    .withMessage(`${paramName} must be a positive integer`),
  handleValidationErrors,
];
