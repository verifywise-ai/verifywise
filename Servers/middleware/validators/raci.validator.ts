import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";
import { RaciRole } from "../../domain.layer/enums/raci.enum";
import { RACI_ROLES } from "../../utils/raci.utils";

const MAX_DB_INT = 2147483647;

// isInt alone also accepts "+5" and "007".
const positiveIdParam = (name: string) =>
  param(name)
    .matches(/^[1-9]\d*$/)
    .withMessage(`${name} must be a positive integer`)
    .isInt({ min: 1, max: MAX_DB_INT })
    .withMessage(`${name} must be a positive integer`);

const isRoleList = (roles: unknown): boolean =>
  Array.isArray(roles) &&
  roles.every((role) => RACI_ROLES.includes(role as RaciRole)) &&
  new Set(roles).size === roles.length;

const roleListField = (name: string) =>
  body(name)
    .optional()
    .custom(isRoleList)
    .withMessage(`${name} must be a list without repeats of: ${RACI_ROLES.join(", ")}`);

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const validateRaciProjectId = [positiveIdParam("id"), handleValidationErrors];

export const validateRaciRoleChange = [
  positiveIdParam("id"),
  positiveIdParam("userId"),
  roleListField("add"),
  roleListField("remove"),
  body("add")
    .custom((_value, { req }) => asList(req.body.add).length + asList(req.body.remove).length > 0)
    .withMessage("add or remove must contain at least one role"),
  body("remove")
    .custom((_value, { req }) => {
      const remove = asList(req.body.remove);
      return !asList(req.body.add).some((role) => remove.includes(role));
    })
    .withMessage("A role cannot be in both add and remove"),
  handleValidationErrors,
];
