/**
 * Risk specific validation utilities
 * Contains validation schemas and functions specifically for project risk operations
 */

import {
  validateString,
  validateEnum,
  validateDate,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for risks
 */
export const RISK_VALIDATION_LIMITS = {
  RISK_NAME: { MIN: 1, MAX: 255 },
  RISK_DESCRIPTION: { MIN: 1, MAX: 1000 },
  IMPACT: { MIN: 1, MAX: 500 },
  ASSESSMENT_MAPPING: { MIN: 1, MAX: 500 },
  CONTROLS_MAPPING: { MIN: 1, MAX: 500 },
  REVIEW_NOTES: { MIN: 1, MAX: 1000 },
  MITIGATION_PLAN: { MIN: 1, MAX: 1000 },
  IMPLEMENTATION_STRATEGY: { MIN: 1, MAX: 1000 },
  MITIGATION_EVIDENCE_DOCUMENT: { MIN: 1, MAX: 500 },
  FINAL_RISK_LEVEL: { MIN: 1, MAX: 100 },
  APPROVAL_STATUS: { MIN: 1, MAX: 100 },
  RECOMMENDATIONS: { MIN: 1, MAX: 1000 },
} as const;

/**
 * AI Lifecycle Phase enum values
 */
export const AI_LIFECYCLE_PHASE_ENUM = [
  "Problem definition & planning",
  "Data collection & processing",
  "Model development & training",
  "Model validation & testing",
  "Deployment & integration",
  "Monitoring & maintenance",
  "Decommissioning & retirement",
] as const;

/**
 * Likelihood enum values
 */
export const LIKELIHOOD_ENUM = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain",
] as const;

/**
 * Severity enum values
 */
export const SEVERITY_ENUM = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"] as const;

/**
 * Risk severity enum values (different from severity)
 */
export const RISK_SEVERITY_ENUM = ["Negligible", "Minor", "Moderate", "Major", "Critical"] as const;

/**
 * Mitigation status enum values
 */
export const MITIGATION_STATUS_ENUM = [
  "Not Started",
  "In Progress",
  "Completed",
  "On Hold",
  "Deferred",
  "Canceled",
  "Requires review",
] as const;

/**
 * Validates risk name field
 */
export const validateRiskName = (value: any): ValidationResult => {
  return validateString(value, "Risk name", {
    required: true,
    minLength: RISK_VALIDATION_LIMITS.RISK_NAME.MIN,
    maxLength: RISK_VALIDATION_LIMITS.RISK_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates risk owner field
 */
export const validateRiskOwner = (value: any): ValidationResult => {
  return validateForeignKey(value, "Risk owner", true);
};

/**
 * Validates AI lifecycle phase field
 */
export const validateAiLifecyclePhase = (value: any): ValidationResult => {
  return validateEnum(value, "AI lifecycle phase", AI_LIFECYCLE_PHASE_ENUM, true);
};

/**
 * Validates risk description field
 */
export const validateRiskDescription = (value: any): ValidationResult => {
  return validateString(value, "Risk description", {
    required: true,
    minLength: RISK_VALIDATION_LIMITS.RISK_DESCRIPTION.MIN,
    maxLength: RISK_VALIDATION_LIMITS.RISK_DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates risk category field (array)
 */
export const validateRiskCategory = (value: any): ValidationResult => {
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Risk category must be an array",
      code: "INVALID_ARRAY",
    };
  }

  if (value.length === 0) {
    return {
      isValid: false,
      message: "Risk category array cannot be empty",
      code: "EMPTY_ARRAY",
    };
  }

  // Validate each category is a string
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string" || value[i].trim().length === 0) {
      return {
        isValid: false,
        message: `Risk category at index ${i} must be a non-empty string`,
        code: "INVALID_CATEGORY",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates impact field
 */
export const validateImpact = (value: any): ValidationResult => {
  return validateString(value, "Impact", {
    required: true,
    minLength: RISK_VALIDATION_LIMITS.IMPACT.MIN,
    maxLength: RISK_VALIDATION_LIMITS.IMPACT.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates likelihood field
 */
export const validateLikelihood = (value: any): ValidationResult => {
  return validateEnum(value, "Likelihood", LIKELIHOOD_ENUM, true);
};

/**
 * Validates severity field
 */
export const validateSeverity = (value: any): ValidationResult => {
  return validateEnum(value, "Severity", SEVERITY_ENUM, true);
};

/**
 * Validates risk severity field
 */
export const validateRiskSeverity = (value: any): ValidationResult => {
  return validateEnum(value, "Risk severity", RISK_SEVERITY_ENUM, true);
};

/**
 * Validates mitigation status field
 */
export const validateMitigationStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Mitigation status", MITIGATION_STATUS_ENUM, true);
};

/**
 * Validates deadline field
 */
export const validateDeadline = (value: any): ValidationResult => {
  return validateDate(value, "Deadline", {
    required: true,
  });
};

/**
 * Validates date of assessment field
 */
export const validateDateOfAssessment = (value: any): ValidationResult => {
  return validateDate(value, "Date of assessment", {
    required: true,
  });
};

/**
 * Validates risk approval field
 */
export const validateRiskApproval = (value: any): ValidationResult => {
  return validateForeignKey(value, "Risk approval", true);
};

/**
 * Validates risk ID for existing records
 */
export const validateRiskId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Risk ID", true);
};

/**
 * Validates project ID for queries
 */
export const validateProjectId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Project ID", true);
};

/**
 * Validates framework ID for queries
 */
export const validateFrameworkId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Framework ID", true);
};

/**
 * Validates frameworks array for risk creation
 * Frameworks should contain only organization framework IDs
 */
export const validateFrameworksArray = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Frameworks array is optional
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Frameworks must be an array",
      code: "INVALID_FRAMEWORKS_TYPE",
    };
  }

  // Allow empty array
  if (value.length === 0) {
    return { isValid: true };
  }

  // Validate each framework ID
  for (let i = 0; i < value.length; i++) {
    const frameworkId = value[i];
    const frameworkValidation = validateForeignKey(frameworkId, `Framework ${i + 1}`, true);
    if (!frameworkValidation.isValid) {
      return {
        isValid: false,
        message: `Framework at index ${i}: ${frameworkValidation.message}`,
        code: "INVALID_FRAMEWORK_ID",
      };
    }
  }

  // Check for duplicates
  const uniqueFrameworks = [...new Set(value)];
  if (uniqueFrameworks.length !== value.length) {
    return {
      isValid: false,
      message: "Frameworks array cannot contain duplicate IDs",
      code: "DUPLICATE_FRAMEWORKS",
    };
  }

  return { isValid: true };
};

/**
 * Validates projects array for risk creation
 * Projects should contain only non-organization project IDs
 */
export const validateProjectsArray = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Projects array is optional
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Projects must be an array",
      code: "INVALID_PROJECTS_TYPE",
    };
  }

  // Allow empty array
  if (value.length === 0) {
    return { isValid: true };
  }

  // Validate each project ID
  for (let i = 0; i < value.length; i++) {
    const projectId = value[i];
    const projectValidation = validateForeignKey(projectId, `Project ${i + 1}`, true);
    if (!projectValidation.isValid) {
      return {
        isValid: false,
        message: `Project at index ${i}: ${projectValidation.message}`,
        code: "INVALID_PROJECT_ID",
      };
    }
  }

  // Check for duplicates
  const uniqueProjects = [...new Set(value)];
  if (uniqueProjects.length !== value.length) {
    return {
      isValid: false,
      message: "Projects array cannot contain duplicate IDs",
      code: "DUPLICATE_PROJECTS",
    };
  }

  return { isValid: true };
};

/**
 * Validation schema for creating a new risk
 */
export const createRiskSchema = {
  risk_name: validateRiskName,
  risk_owner: validateRiskOwner,
  ai_lifecycle_phase: validateAiLifecyclePhase,
  risk_description: validateRiskDescription,
  risk_category: validateRiskCategory,
  impact: validateImpact,
  likelihood: validateLikelihood,
  severity: validateSeverity,
  risk_severity: validateRiskSeverity,
  mitigation_status: validateMitigationStatus,
  deadline: validateDeadline,
  date_of_assessment: validateDateOfAssessment,
  risk_approval: validateRiskApproval,
  frameworks: validateFrameworksArray,
  projects: validateProjectsArray,
};

/**
 * Validation schema for updating a risk
 * All fields are optional for updates
 */
export const updateRiskSchema = {
  risk_name: (value: any) => (value !== undefined ? validateRiskName(value) : { isValid: true }),
  risk_owner: (value: any) => (value !== undefined ? validateRiskOwner(value) : { isValid: true }),
  ai_lifecycle_phase: (value: any) =>
    value !== undefined ? validateAiLifecyclePhase(value) : { isValid: true },
  risk_description: (value: any) =>
    value !== undefined ? validateRiskDescription(value) : { isValid: true },
  risk_category: (value: any) =>
    value !== undefined ? validateRiskCategory(value) : { isValid: true },
  impact: (value: any) => (value !== undefined ? validateImpact(value) : { isValid: true }),
  likelihood: (value: any) => (value !== undefined ? validateLikelihood(value) : { isValid: true }),
  severity: (value: any) => (value !== undefined ? validateSeverity(value) : { isValid: true }),
  risk_severity: (value: any) =>
    value !== undefined ? validateRiskSeverity(value) : { isValid: true },
  mitigation_status: (value: any) =>
    value !== undefined ? validateMitigationStatus(value) : { isValid: true },
  deadline: (value: any) => (value !== undefined ? validateDeadline(value) : { isValid: true }),
  date_of_assessment: (value: any) =>
    value !== undefined ? validateDateOfAssessment(value) : { isValid: true },
  risk_approval: (value: any) =>
    value !== undefined ? validateRiskApproval(value) : { isValid: true },
  frameworks: (value: any) =>
    value !== undefined ? validateFrameworksArray(value) : { isValid: true },
  projects: (value: any) =>
    value !== undefined ? validateProjectsArray(value) : { isValid: true },
};

/**
 * Validates a risk object for updates
 */
export const validateUpdateRisk = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  // Use blacklist approach - exclude system/readonly fields instead of whitelist
  const readOnlyFields = ["id", "created_at", "updated_at", "tenant_id"];
  const updateableFields = Object.keys(data).filter((field) => !readOnlyFields.includes(field));

  if (updateableFields.length === 0) {
    return [
      {
        field: "body",
        message: "At least one updateable field must be provided for update",
        code: "NO_UPDATE_FIELDS",
      },
    ];
  }

  return validateSchema(data, updateRiskSchema);
};

/**
 * Validates risk ID parameter
 */
export const validateRiskIdParam = (id: any): ValidationResult => {
  return validateRiskId(id);
};

/**
 * Validates project ID parameter
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateProjectId(id);
};

/**
 * Validates framework ID parameter
 */
export const validateFrameworkIdParam = (id: any): ValidationResult => {
  return validateFrameworkId(id);
};
