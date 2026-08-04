import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import { HighRiskRole } from "../../domain.layer/enums/high-risk-role.enum";
import { ProjectStatus } from "../../domain.layer/enums/project-status.enum";

const projectIdParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

// Fields that are typed-checked whenever they are present (create + update).
const optionalProjectBodyFields = [
  body("project_title")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("project_title must be a non-empty string"),
  body("owner")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("owner must be a positive integer"),
  body("start_date").optional().isISO8601().withMessage("start_date must be a valid ISO 8601 date"),
  body("geography")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("geography must be a positive integer"),
  body("goal").optional({ nullable: true }).isString().withMessage("goal must be a string"),
  body("target_industry")
    .optional({ nullable: true })
    .isString()
    .withMessage("target_industry must be a string"),
  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("description must be a string"),
  body("ai_risk_classification")
    .optional({ nullable: true })
    .isIn(Object.values(AiRiskClassification))
    .withMessage(
      `ai_risk_classification must be one of: ${Object.values(AiRiskClassification).join(", ")}`,
    ),
  body("type_of_high_risk_role")
    .optional({ nullable: true })
    .isIn(Object.values(HighRiskRole))
    .withMessage(
      `type_of_high_risk_role must be one of: ${Object.values(HighRiskRole).join(", ")}`,
    ),
  body("status")
    .optional({ nullable: true })
    .isIn(Object.values(ProjectStatus))
    .withMessage(`status must be one of: ${Object.values(ProjectStatus).join(", ")}`),
  body("is_organizational")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("is_organizational must be a boolean"),
  body("enable_ai_data_insertion")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("enable_ai_data_insertion must be a boolean"),
  body("uc_id").optional({ nullable: true }).isString().withMessage("uc_id must be a string"),
  body("approval_workflow_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("approval_workflow_id must be a positive integer"),
  body("members")
    .optional({ nullable: true })
    .isArray()
    .withMessage("members must be an array of user ids"),
  body("members.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("each member must be a positive integer"),
  body("framework")
    .optional({ nullable: true })
    .isArray()
    .withMessage("framework must be an array of framework ids"),
  body("framework.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("each framework must be a positive integer"),
];

export const validateProjectIdParam = [projectIdParam, handleValidationErrors];

export const validateProjectProjIdParam = [
  param("projid").isInt({ min: 1 }).withMessage("projid must be a positive integer"),
  handleValidationErrors,
];

export const validateCreateProject = [
  body("project_title")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("project_title is required and must be a non-empty string"),
  body("owner").isInt({ min: 1 }).withMessage("owner is required and must be a positive integer"),
  body("start_date")
    .isISO8601()
    .withMessage("start_date is required and must be a valid ISO 8601 date"),
  ...optionalProjectBodyFields,
  handleValidationErrors,
];

export const validateUpdateProject = [
  projectIdParam,
  ...optionalProjectBodyFields,
  handleValidationErrors,
];

export const validateUpdateProjectStatus = [
  projectIdParam,
  body("status")
    .isIn(Object.values(ProjectStatus))
    .withMessage(`status must be one of: ${Object.values(ProjectStatus).join(", ")}`),
  handleValidationErrors,
];
