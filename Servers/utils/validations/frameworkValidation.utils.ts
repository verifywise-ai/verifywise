/**
 * Framework specific validation utilities
 * Contains validation schemas and functions specifically for framework operations
 */

import {
  validateString,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for frameworks
 */
export const FRAMEWORK_VALIDATION_LIMITS = {
  NAME: { MIN: 1, MAX: 255 },
  DESCRIPTION: { MIN: 1, MAX: 1000 },
  SEARCH_QUERY: { MIN: 1, MAX: 100 },
} as const;

/**
 * Validates framework name field
 */
export const validateFrameworkName = (value: any): ValidationResult => {
  return validateString(value, "Framework name", {
    required: true,
    minLength: FRAMEWORK_VALIDATION_LIMITS.NAME.MIN,
    maxLength: FRAMEWORK_VALIDATION_LIMITS.NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates framework description field
 */
export const validateFrameworkDescription = (value: any): ValidationResult => {
  return validateString(value, "Framework description", {
    required: true,
    minLength: FRAMEWORK_VALIDATION_LIMITS.DESCRIPTION.MIN,
    maxLength: FRAMEWORK_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates framework ID parameter
 */
export const validateFrameworkIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Framework ID", true);
};

/**
 * Validates project ID parameter for framework operations
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Project ID", true);
};

/**
 * Validates search query parameter
 */
export const validateSearchQuery = (value: any): ValidationResult => {
  return validateString(value, "Search query", {
    required: true,
    minLength: FRAMEWORK_VALIDATION_LIMITS.SEARCH_QUERY.MIN,
    maxLength: FRAMEWORK_VALIDATION_LIMITS.SEARCH_QUERY.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validation schema for creating a new framework
 */
export const createFrameworkSchema = {
  name: validateFrameworkName,
  description: validateFrameworkDescription,
};

/**
 * Validation schema for updating a framework
 * All fields are optional for updates
 */
export const updateFrameworkSchema = {
  name: (value: any) => (value !== undefined ? validateFrameworkName(value) : { isValid: true }),
  description: (value: any) =>
    value !== undefined ? validateFrameworkDescription(value) : { isValid: true },
};

/**
 * Validates a complete framework object for creation
 */
export const validateCompleteFramework = (data: any): ValidationError[] => {
  return validateSchema(data, createFrameworkSchema);
};

/**
 * Validation for framework-to-project operations
 */
export const validateFrameworkProjectOperation = (
  frameworkId: any,
  projectId: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  const frameworkIdValidation = validateFrameworkIdParam(frameworkId);
  if (!frameworkIdValidation.isValid) {
    errors.push({
      field: "frameworkId",
      message: frameworkIdValidation.message || "Invalid framework ID",
      code: frameworkIdValidation.code || "INVALID_FRAMEWORK_ID",
    });
  }

  const projectIdValidation = validateProjectIdParam(projectId);
  if (!projectIdValidation.isValid) {
    errors.push({
      field: "projectId",
      message: projectIdValidation.message || "Invalid project ID",
      code: projectIdValidation.code || "INVALID_PROJECT_ID",
    });
  }

  return errors;
};
