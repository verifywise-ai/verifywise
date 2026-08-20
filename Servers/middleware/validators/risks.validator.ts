import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const AI_LIFECYCLE_PHASES = [
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
];

const LIKELIHOODS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];
const SEVERITIES = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
const RISK_SEVERITIES = ["Negligible", "Minor", "Moderate", "Major", "Critical"];
const RISK_LEVELS = [
  "No risk",
  "Very low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
];
const CURRENT_RISK_LEVELS = [
  "Very Low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
];
const MITIGATION_STATUSES = [
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
];

const FAIR_NUMERIC_FIELDS = [
  "event_frequency_min",
  "event_frequency_likely",
  "event_frequency_max",
  "loss_regulatory_min",
  "loss_regulatory_likely",
  "loss_regulatory_max",
  "loss_operational_min",
  "loss_operational_likely",
  "loss_operational_max",
  "loss_litigation_min",
  "loss_litigation_likely",
  "loss_litigation_max",
  "loss_reputational_min",
  "loss_reputational_likely",
  "loss_reputational_max",
  "total_loss_likely",
  "ale_estimate",
  "control_effectiveness",
  "residual_ale",
  "mitigation_cost_annual",
  "roi_percentage",
];

const riskIdParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

// Fields that are typed-checked whenever they are present (create + update).
const optionalRiskBodyFields = [
  body("risk_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("risk_name must be a non-empty string"),
  body("risk_owner")
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage("risk_owner must be a non-negative integer"),
  body("risk_description")
    .optional({ nullable: true })
    .isString()
    .withMessage("risk_description must be a string"),
  body("ai_lifecycle_phase")
    .optional({ nullable: true })
    .isIn(AI_LIFECYCLE_PHASES)
    .withMessage(`ai_lifecycle_phase must be one of: ${AI_LIFECYCLE_PHASES.join(", ")}`),
  body("risk_category")
    .optional({ nullable: true })
    .isArray()
    .withMessage("risk_category must be an array of strings"),
  body("risk_category.*")
    .optional()
    .isString()
    .withMessage("each risk_category entry must be a string"),
  body("impact").optional({ nullable: true }).isString().withMessage("impact must be a string"),
  body("assessment_mapping")
    .optional({ nullable: true })
    .isString()
    .withMessage("assessment_mapping must be a string"),
  body("controls_mapping")
    .optional({ nullable: true })
    .isString()
    .withMessage("controls_mapping must be a string"),
  body("likelihood")
    .optional({ nullable: true })
    .isIn(LIKELIHOODS)
    .withMessage(`likelihood must be one of: ${LIKELIHOODS.join(", ")}`),
  body("severity")
    .optional({ nullable: true })
    .isIn(SEVERITIES)
    .withMessage(`severity must be one of: ${SEVERITIES.join(", ")}`),
  body("risk_level_autocalculated")
    .optional({ nullable: true })
    .isIn(RISK_LEVELS)
    .withMessage(`risk_level_autocalculated must be one of: ${RISK_LEVELS.join(", ")}`),
  body("review_notes")
    .optional({ nullable: true })
    .isString()
    .withMessage("review_notes must be a string"),
  body("mitigation_status")
    .optional({ nullable: true })
    .isIn(MITIGATION_STATUSES)
    .withMessage(`mitigation_status must be one of: ${MITIGATION_STATUSES.join(", ")}`),
  body("current_risk_level")
    .optional({ nullable: true })
    .isIn(CURRENT_RISK_LEVELS)
    .withMessage(`current_risk_level must be one of: ${CURRENT_RISK_LEVELS.join(", ")}`),
  body("deadline")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("deadline must be a valid ISO 8601 date"),
  body("mitigation_plan")
    .optional({ nullable: true })
    .isString()
    .withMessage("mitigation_plan must be a string"),
  body("implementation_strategy")
    .optional({ nullable: true })
    .isString()
    .withMessage("implementation_strategy must be a string"),
  body("mitigation_evidence_document")
    .optional({ nullable: true })
    .isString()
    .withMessage("mitigation_evidence_document must be a string"),
  body("likelihood_mitigation")
    .optional({ nullable: true })
    .isIn(LIKELIHOODS)
    .withMessage(`likelihood_mitigation must be one of: ${LIKELIHOODS.join(", ")}`),
  body("risk_severity")
    .optional({ nullable: true })
    .isIn(RISK_SEVERITIES)
    .withMessage(`risk_severity must be one of: ${RISK_SEVERITIES.join(", ")}`),
  body("final_risk_level")
    .optional({ nullable: true })
    .isString()
    .withMessage("final_risk_level must be a string"),
  body("risk_approval")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("risk_approval must be a positive integer"),
  body("approval_status")
    .optional({ nullable: true })
    .isString()
    .withMessage("approval_status must be a string"),
  body("date_of_assessment")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("date_of_assessment must be a valid ISO 8601 date"),
  body("project_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("project_id must be a positive integer"),
  body("projects")
    .optional({ nullable: true })
    .isArray()
    .withMessage("projects must be an array of project ids"),
  body("projects.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("each project id must be a positive integer"),
  body("frameworks")
    .optional({ nullable: true })
    .isArray()
    .withMessage("frameworks must be an array of framework ids"),
  body("frameworks.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("each framework id must be a positive integer"),
  body("benchmark_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("benchmark_id must be a positive integer"),
  body("currency")
    .optional({ nullable: true })
    .isString()
    .isLength({ min: 3, max: 3 })
    .withMessage("currency must be a 3-letter code"),
  ...FAIR_NUMERIC_FIELDS.map((field) =>
    body(field).optional({ nullable: true }).isFloat().withMessage(`${field} must be a number`),
  ),
];

export const validateRiskIdParam = [riskIdParam, handleValidationErrors];

export const validateCreateRisk = [
  body("risk_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("risk_name is required and must be a non-empty string"),
  body("risk_owner")
    .isInt({ min: 1 })
    .withMessage("risk_owner is required and must be a positive integer"),
  ...optionalRiskBodyFields,
  handleValidationErrors,
];

export const validateUpdateRisk = [riskIdParam, ...optionalRiskBodyFields, handleValidationErrors];

export const validateBulkUpdateProjectRisks = [
  body("ids").isArray({ min: 1 }).withMessage("ids must be a non-empty array of risk ids"),
  body("ids.*").isInt({ min: 1 }).withMessage("each id must be a positive integer"),
  body("action")
    .isIn(["set_owner", "set_category", "archive"])
    .withMessage("action must be one of: set_owner, set_category, archive"),
  handleValidationErrors,
];
