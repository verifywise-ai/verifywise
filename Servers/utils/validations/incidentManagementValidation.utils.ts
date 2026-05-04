/**
 * Incident Management specific validation utilities
 * Contains validation schemas and functions specifically for AI incident reporting and compliance (EU AI Act Article 73)
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
 * Validation limits for incident management
 */
export const INCIDENT_VALIDATION_LIMITS = {
  DESCRIPTION: { MIN: 5, MAX: 1000 },
  RELATIONSHIP: { MIN: 3, MAX: 255 },
  PROJECT: { MIN: 2, MAX: 255 },
  REPORTER: { MIN: 2, MAX: 100 },
} as const;

/**
 * Incident severity levels
 */
export const INCIDENT_SEVERITY_ENUM = ["Minor", "Serious", "Very Serious"] as const;

/**
 * Incident status values
 */
export const INCIDENT_STATUS_ENUM = ["Open", "Investigating", "Mitigated", "Closed"] as const;

/**
 * Approval status values
 */
export const APPROVAL_STATUS_ENUM = ["Pending", "Approved", "Rejected", "Not Required"] as const;

/**
 * Categories of harm per EU AI Act Article 73
 */
export const INCIDENT_HARM_CATEGORIES_ENUM = [
  "Health and Safety",
  "Fundamental Rights Violation",
  "Environmental Impact",
  "Economic Loss",
  "Privacy or Data Breach",
  "Security Threat",
  "Other",
] as const;

/**
 * Validates description
 */
export const validateDescription = (value: any): ValidationResult => {
  return validateString(value, "Description", {
    required: true,
    minLength: INCIDENT_VALIDATION_LIMITS.DESCRIPTION.MIN,
    maxLength: INCIDENT_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates categories of harm
 */
export const validateCategoriesOfHarm = (value: any): ValidationResult => {
  if (!Array.isArray(value) || value.length < 1) {
    return {
      isValid: false,
      message: "At least one harm category is required",
      code: "REQUIRED_FIELD",
    };
  }

  for (const category of value) {
    if (!INCIDENT_HARM_CATEGORIES_ENUM.includes(category as any)) {
      return {
        isValid: false,
        message: `Invalid harm category: "${category}". Must be one of: ${INCIDENT_HARM_CATEGORIES_ENUM.join(", ")}`,
        code: "INVALID_HARM_CATEGORY",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates relationship/causality
 */
export const validateRelationship = (value: any): ValidationResult => {
  return validateString(value, "Relationship/Causality", {
    required: true,
    minLength: INCIDENT_VALIDATION_LIMITS.RELATIONSHIP.MIN,
    maxLength: INCIDENT_VALIDATION_LIMITS.RELATIONSHIP.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates AI project/system field
 */
export const validateAIProject = (value: any): ValidationResult => {
  return validateString(value, "AI Project/System", {
    required: true,
    minLength: INCIDENT_VALIDATION_LIMITS.PROJECT.MIN,
    maxLength: INCIDENT_VALIDATION_LIMITS.PROJECT.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates severity level
 */
export const validateSeverity = (value: any): ValidationResult => {
  return validateEnum(value, "Severity Level", INCIDENT_SEVERITY_ENUM, true);
};

/**
 * Validates status
 */
export const validateStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Status", INCIDENT_STATUS_ENUM, true);
};

/**
 * Validates approval status
 */
export const validateApprovalStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Approval Status", APPROVAL_STATUS_ENUM, true);
};

/**
 * Validates date occurred
 */
export const validateDateOccurred = (value: any): ValidationResult => {
  return validateDate(value, "Date Occurred", { required: true });
};

/**
 * Validates date detected
 */
export const validateDateDetected = (value: any): ValidationResult => {
  return validateDate(value, "Date Detected", { required: true });
};

/**
 * Validates reporter field
 */
export const validateReporter = (value: any): ValidationResult => {
  return validateString(value, "Reporter", {
    required: true,
    minLength: INCIDENT_VALIDATION_LIMITS.REPORTER.MIN,
    maxLength: INCIDENT_VALIDATION_LIMITS.REPORTER.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates approver field (foreign key)
 */
export const validateApprover = (value: any): ValidationResult => {
  return validateForeignKey(value, "Approver", false);
};

/**
 * Validation schema for creating an incident
 */
export const createIncidentSchema = {
  // description: validateDescription,
  // date_occurred: validateDateOccurred,
  // date_detected: validateDateDetected,
};

/**
 * Validation schema for updating an incident
 */
export const updateIncidentSchema = {
  // description: validateDescription,
  // categories_of_harm: validateCategoriesOfHarm,
  // relationship_to_ai_system: validateRelationship,
  // ai_project: validateAIProject,
  // severity: validateSeverity,
  // status: validateStatus,
  // date_occurred: validateDateOccurred,
  // date_detected: validateDateDetected,
  // reporter: validateReporter,
  // approval_status: validateApprovalStatus,
};

export const validateIncidentIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Incident ID", true);
};

/**
 * Validates a complete incident for creation
 */
export const validateCompleteIncident = (data: any): ValidationError[] => {
  return validateSchema(data, createIncidentSchema);
};

/**
 * Validates a complete incident for update
 */
export const validateUpdateIncident = (data: any): ValidationError[] => {
  return validateSchema(data, updateIncidentSchema);
};

/**
 * Business rule validation for incident creation
 */
export const validateIncidentCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (new Date(data.date_detected) < new Date(data.date_occurred)) {
    errors.push({
      field: "date_detected",
      message: "Date detected cannot be earlier than date occurred",
      code: "INVALID_DATE_ORDER",
    });
  }

  return errors;
};

/**
 * Business rule validation for incident updates
 */
export const validateIncidentUpdateBusinessRules = (
  _data: any,
  _existingData?: any,
): ValidationError[] => {
  // All business rules removed - incidents can now be freely updated
  return [];
};

/**
 * Complete validation for incident creation
 */
export const validateCompleteIncidentCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteIncident(data);
  const businessErrors = validateIncidentCreationBusinessRules(data);
  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for incident update
 */
export const validateCompleteIncidentUpdate = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const validationErrors = validateUpdateIncident(data);
  const businessErrors = validateIncidentUpdateBusinessRules(data, existingData);
  return [...validationErrors, ...businessErrors];
};
