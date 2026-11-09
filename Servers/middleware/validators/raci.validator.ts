import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";
import { RaciRole } from "../../domain.layer/enums/raci.enum";
import { RACI_ROLES } from "../../utils/raci.utils";

const MAX_DB_INT = 2147483647;

// isInt alone also accepts "+5" and "007".
const positiveIdParam = (name: string) =>
  param(name)
    .matches(/^[1-9]\d*$/)
    .isInt({ min: 1, max: MAX_DB_INT })
    .withMessage(`${name} must be a positive integer`);

const isRoleList = (roles: unknown): boolean =>
  Array.isArray(roles) &&
  roles.every((role) => RACI_ROLES.includes(role as RaciRole)) &&
  new Set(roles).size === roles.length;

export const validateRaciProjectId = [positiveIdParam("id"), handleValidationErrors];

export const validateRaciUserRoles = [
  positiveIdParam("id"),
  positiveIdParam("userId"),
  body("roles")
    .custom(isRoleList)
    .withMessage(`roles must be a list without repeats of: ${RACI_ROLES.join(", ")}`),
  handleValidationErrors,
];
