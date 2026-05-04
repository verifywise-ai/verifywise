/**
 * Model Risk specific validation utilities
 * Contains validation schemas and functions specifically for model risk operations
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
import { ModelRiskCategory } from "../../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../../domain.layer/enums/model-risk-level.enum";
import { ModelRiskStatus } from "../../domain.layer/enums/model-risk-status.enum";

/**
 * Validation constants for model risks
 */
export const MODEL_RISK_VALIDATION_LIMITS = {
  RISK_NAME: { MIN: 3, MAX: 255 },
  OWNER: { MIN: 2, MAX: 100 },
  DESCRIPTION: { MIN: 10, MAX: 2000 },
  MITIGATION_PLAN: { MIN: 10, MAX: 2000 },
  NOTES: { MIN: 1, MAX: 1000 },
} as const;

/**
 * Model risk category enum values
 */
export const MODEL_RISK_CATEGORY_ENUM = Object.values(ModelRiskCategory);

/**
 * Model risk level enum values
 */
export const MODEL_RISK_LEVEL_ENUM = Object.values(ModelRiskLevel);

/**
 * Model risk status enum values
 */
export const MODEL_RISK_STATUS_ENUM = Object.values(ModelRiskStatus);

/**
 * Validates risk name field
 */
export const validateRiskName = (value: any): ValidationResult => {
  return validateString(value, "Risk name", {
    required: true,
    minLength: MODEL_RISK_VALIDATION_LIMITS.RISK_NAME.MIN,
    maxLength: MODEL_RISK_VALIDATION_LIMITS.RISK_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates risk category field
 */
export const validateRiskCategory = (value: any): ValidationResult => {
  return validateEnum(value, "Risk category", MODEL_RISK_CATEGORY_ENUM, true);
};

/**
 * Validates risk level field
 */
export const validateRiskLevel = (value: any): ValidationResult => {
  return validateEnum(value, "Risk level", MODEL_RISK_LEVEL_ENUM, true);
};

/**
 * Validates model risk status field
 */
export const validateModelRiskStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Risk status", MODEL_RISK_STATUS_ENUM, true);
};

/**
 * Validates owner field
 */
export const validateOwner = (value: any): ValidationResult => {
  return validateString(value, "Owner", {
    required: true,
    minLength: MODEL_RISK_VALIDATION_LIMITS.OWNER.MIN,
    maxLength: MODEL_RISK_VALIDATION_LIMITS.OWNER.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates target date field
 */
export const validateTargetDate = (value: any): ValidationResult => {
  return validateDate(value, "Target date", { required: true });
};

/**
 * Validates description field (optional)
 */
export const validateDescription = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Description is optional
  }

  return validateString(value, "Description", {
    required: false,
    minLength: MODEL_RISK_VALIDATION_LIMITS.DESCRIPTION.MIN,
    maxLength: MODEL_RISK_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates mitigation plan field (optional)
 */
export const validateMitigationPlan = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Mitigation plan is optional
  }

  return validateString(value, "Mitigation plan", {
    required: false,
    minLength: MODEL_RISK_VALIDATION_LIMITS.MITIGATION_PLAN.MIN,
    maxLength: MODEL_RISK_VALIDATION_LIMITS.MITIGATION_PLAN.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates notes field (optional)
 */
export const validateNotes = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Notes are optional
  }

  return validateString(value, "Notes", {
    required: false,
    minLength: MODEL_RISK_VALIDATION_LIMITS.NOTES.MIN,
    maxLength: MODEL_RISK_VALIDATION_LIMITS.NOTES.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates model risk ID parameter
 */
export const validateModelRiskIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Model risk ID", true);
};

/**
 * Validation schema for creating a new model risk
 */
export const createModelRiskSchema = {
  riskName: validateRiskName,
  riskCategory: validateRiskCategory,
  riskLevel: validateRiskLevel,
  status: validateModelRiskStatus,
  owner: validateOwner,
  targetDate: validateTargetDate,
  description: validateDescription,
  mitigationPlan: validateMitigationPlan,
  notes: validateNotes,
};

/**
 * Validation schema for updating a model risk
 * All fields are required for updates based on the controller logic
 */
export const updateModelRiskSchema = {
  riskName: validateRiskName,
  riskCategory: validateRiskCategory,
  riskLevel: validateRiskLevel,
  status: validateModelRiskStatus,
  owner: validateOwner,
  targetDate: validateTargetDate,
  description: validateDescription,
  mitigationPlan: validateMitigationPlan,
  notes: validateNotes,
};

/**
 * Validates a complete model risk object for creation
 */
export const validateCompleteModelRisk = (data: any): ValidationError[] => {
  return validateSchema(data, createModelRiskSchema);
};

/**
 * Validates a model risk object for updates
 */
export const validateUpdateModelRisk = (data: any): ValidationError[] => {
  return validateSchema(data, updateModelRiskSchema);
};

/**
 * Business rule validation for model risk creation
 */
export const validateModelRiskCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate target date is in the future
  if (data.targetDate) {
    const targetDate = new Date(data.targetDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

    if (targetDate <= today) {
      errors.push({
        field: "targetDate",
        message: "Target date must be in the future",
        code: "INVALID_TARGET_DATE",
      });
    }

    // Warn if target date is too far in the future
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    if (targetDate > oneYearFromNow) {
      errors.push({
        field: "targetDate",
        message: "Target date more than one year in the future may indicate unrealistic timeline",
        code: "DISTANT_TARGET_DATE",
      });
    }
  }

  // Validate risk level and mitigation plan consistency
  if (data.riskLevel && data.mitigationPlan) {
    const highRiskLevels = ["High", "Critical"];
    if (
      highRiskLevels.includes(data.riskLevel) &&
      (!data.mitigationPlan || data.mitigationPlan.length < 50)
    ) {
      errors.push({
        field: "mitigationPlan",
        message:
          "High and Critical risk levels require detailed mitigation plans (minimum 50 characters)",
        code: "INSUFFICIENT_MITIGATION_PLAN",
      });
    }
  }

  // // Validate category and description alignment
  // if (data.riskCategory && data.description) {
  //   const categoryKeywords = {
  //     'Performance': ['accuracy', 'precision', 'recall', 'performance', 'degradation', 'drift'],
  //     'Bias & Fairness': ['bias', 'fairness', 'discrimination', 'equity', 'disparity', 'representation'],
  //     'Security': ['security', 'attack', 'adversarial', 'vulnerability', 'breach', 'privacy'],
  //     'Data Quality': ['data', 'quality', 'completeness', 'accuracy', 'consistency', 'validity'],
  //     'Compliance': ['compliance', 'regulation', 'legal', 'audit', 'policy', 'requirement']
  //   };

  //   const keywords = categoryKeywords[data.riskCategory as keyof typeof categoryKeywords];
  //   if (keywords && !keywords.some(keyword =>
  //     data.description.toLowerCase().includes(keyword.toLowerCase())
  //   )) {
  //     errors.push({
  //       field: 'description',
  //       message: `Description should relate to ${data.riskCategory} category concerns`,
  //       code: 'CATEGORY_DESCRIPTION_MISMATCH'
  //     });
  //   }
  // }

  // Validate owner format (should include full name)
  if (data.owner) {
    if (!data.owner.includes(" ") || data.owner.length < 5) {
      errors.push({
        field: "owner",
        message: "Owner should include full name (first and last name)",
        code: "INVALID_OWNER_FORMAT",
      });
    }
  }

  // Validate status for new risks
  if (data.status) {
    const validInitialStatuses = ["Open"];
    if (!validInitialStatuses.includes(data.status)) {
      errors.push({
        field: "status",
        message: 'New model risks should start with "Open" status',
        code: "INVALID_INITIAL_STATUS",
      });
    }
  }

  // // Validate risk name doesn't contain inappropriate terms
  // if (data.riskName) {
  //   const inappropriateTerms = ['test', 'dummy', 'fake', 'sample', 'todo'];
  //   const containsInappropriate = inappropriateTerms.some(term =>
  //     data.riskName.toLowerCase().includes(term.toLowerCase())
  //   );
  //   if (containsInappropriate) {
  //     errors.push({
  //       field: 'riskName',
  //       message: 'Risk name should not contain test or placeholder terms',
  //       code: 'INAPPROPRIATE_RISK_NAME'
  //     });
  //   }
  // }

  return errors;
};

/**
 * Business rule validation for model risk updates
 */
export const validateModelRiskUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      {
        from: "Resolved",
        to: "Open",
        message: "Cannot reopen resolved risks without proper justification",
      },
      {
        from: "Accepted",
        to: "Open",
        message: "Cannot reopen accepted risks without risk committee approval",
      },
      {
        from: "Resolved",
        to: "In Progress",
        message: "Resolved risks should not be moved back to in progress",
      },
    ];

    const invalidTransition = invalidTransitions.find(
      (t) => t.from === existingData.status && t.to === data.status,
    );

    if (invalidTransition) {
      errors.push({
        field: "status",
        message: invalidTransition.message,
        code: "INVALID_STATUS_TRANSITION",
      });
    }
  }

  // Validate target date updates
  if (data.targetDate) {
    const targetDate = new Date(data.targetDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Allow past dates for resolved/accepted risks
    if (data.status && !["Resolved", "Accepted"].includes(data.status) && targetDate <= today) {
      errors.push({
        field: "targetDate",
        message: "Target date must be in the future for active risks",
        code: "INVALID_TARGET_DATE",
      });
    }

    // Check if target date is being moved further into the future multiple times
    if (existingData?.targetDate) {
      const existingTargetDate = new Date(existingData.targetDate);
      if (targetDate > existingTargetDate) {
        const daysDifference = Math.ceil(
          (targetDate.getTime() - existingTargetDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysDifference > 30) {
          errors.push({
            field: "targetDate",
            message:
              "Moving target date more than 30 days into the future may indicate scope creep",
            code: "SIGNIFICANT_DATE_EXTENSION",
          });
        }
      }
    }
  }

  // Validate mitigation plan requirements for status changes
  if (data.status === "In Progress" && (!data.mitigationPlan || data.mitigationPlan.length < 20)) {
    errors.push({
      field: "mitigationPlan",
      message: 'Moving risk to "In Progress" requires a detailed mitigation plan',
      code: "MITIGATION_PLAN_REQUIRED",
    });
  }

  if (data.status === "Resolved" && (!data.mitigationPlan || data.mitigationPlan.length < 50)) {
    errors.push({
      field: "mitigationPlan",
      message: "Resolving risk requires comprehensive documentation of mitigation actions taken",
      code: "RESOLUTION_DOCUMENTATION_REQUIRED",
    });
  }

  // Validate risk level escalation
  if (data.riskLevel && existingData?.riskLevel) {
    const riskLevelHierarchy = ["Low", "Medium", "High", "Critical"];
    const currentLevel = riskLevelHierarchy.indexOf(existingData.riskLevel);
    const newLevel = riskLevelHierarchy.indexOf(data.riskLevel);

    if (newLevel > currentLevel + 1) {
      errors.push({
        field: "riskLevel",
        message: "Escalating risk level by more than one tier requires additional justification",
        code: "SIGNIFICANT_RISK_ESCALATION",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for model risk creation with business rules
 */
export const validateCompleteModelRiskCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteModelRisk(data);
  const businessErrors = validateModelRiskCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for model risk updates with business rules
 */
export const validateCompleteModelRiskUpdate = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const validationErrors = validateUpdateModelRisk(data);
  const businessErrors = validateModelRiskUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};
