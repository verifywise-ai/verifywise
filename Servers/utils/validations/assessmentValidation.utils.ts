/**
 * Assessment specific validation utilities
 * Contains validation functions for assessment GET route parameters
 * Note: Focus on GET route parameter validation
 */

import { validateForeignKey, ValidationResult } from "./validation.utils";

/**
 * Validates assessment ID for existing records
 */
export const validateAssessmentId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Assessment ID", true);
};

/**
 * Validates project ID for queries
 */
export const validateProjectId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Project ID", true);
};

/**
 * Validates assessment ID parameter
 */
export const validateAssessmentIdParam = (id: any): ValidationResult => {
  return validateAssessmentId(id);
};

/**
 * Validates project ID parameter
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateProjectId(id);
};
