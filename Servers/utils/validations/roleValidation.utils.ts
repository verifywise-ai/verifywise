/**
 * Role specific validation utilities
 * Contains validation functions for role GET route parameters
 * Note: Focus on GET route parameter validation
 */

import { validateForeignKey, ValidationResult } from "./validation.utils";

/**
 * Validates role ID for existing records
 */
export const validateRoleId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Role ID", true);
};

/**
 * Validates role ID parameter
 */
export const validateRoleIdParam = (id: any): ValidationResult => {
  return validateRoleId(id);
};
