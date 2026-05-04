/**
 * Question specific validation utilities
 * Contains validation functions for question GET route parameters
 * Note: Questions only have GET routes, no CREATE/UPDATE operations via API
 */

import { validateForeignKey, ValidationResult } from "./validation.utils";

/**
 * Validates question ID for existing records
 */
export const validateQuestionId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Question ID", true);
};

/**
 * Validates subtopic ID for queries
 */
export const validateSubtopicId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Subtopic ID", true);
};

/**
 * Validates topic ID for queries
 */
export const validateTopicId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Topic ID", true);
};

/**
 * Validates question ID parameter
 */
export const validateQuestionIdParam = (id: any): ValidationResult => {
  return validateQuestionId(id);
};

/**
 * Validates subtopic ID parameter
 */
export const validateSubtopicIdParam = (id: any): ValidationResult => {
  return validateSubtopicId(id);
};

/**
 * Validates topic ID parameter
 */
export const validateTopicIdParam = (id: any): ValidationResult => {
  return validateTopicId(id);
};
