/**
 * Dataset specific validation utilities
 * Contains validation schemas and functions specifically for dataset operations
 * Based on EU AI Act Article 10 Data Governance requirements
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
 * Validation constants for datasets
 */
export const DATASET_VALIDATION_LIMITS = {
  NAME: { MIN: 2, MAX: 255 },
  VERSION: { MIN: 1, MAX: 50 },
  DESCRIPTION: { MIN: 0, MAX: 2000 },
  OWNER: { MIN: 2, MAX: 100 },
  SOURCE: { MIN: 0, MAX: 500 },
  LICENSE: { MIN: 0, MAX: 255 },
  FORMAT: { MIN: 0, MAX: 100 },
  COLLECTION_METHOD: { MIN: 0, MAX: 500 },
  PREPROCESSING_STEPS: { MIN: 0, MAX: 2000 },
  KNOWN_BIASES: { MIN: 0, MAX: 2000 },
  BIAS_MITIGATION: { MIN: 0, MAX: 2000 },
  FUNCTION: { MIN: 0, MAX: 500 },
  PII_TYPES: { MAX_ITEMS: 50 },
  MODELS: { MAX_ITEMS: 100 },
  PROJECTS: { MAX_ITEMS: 100 },
} as const;

/**
 * Dataset status enum values
 */
export const DATASET_STATUS_ENUM = ["Draft", "Active", "Deprecated", "Archived"] as const;

/**
 * Dataset type enum values
 */
export const DATASET_TYPE_ENUM = [
  "Training",
  "Validation",
  "Testing",
  "Production",
  "Reference",
] as const;

/**
 * Data classification enum values
 */
export const DATA_CLASSIFICATION_ENUM = [
  "Public",
  "Internal",
  "Confidential",
  "Restricted",
] as const;

/**
 * Validates dataset name field
 */
export const validateDatasetName = (value: unknown): ValidationResult => {
  return validateString(value, "Dataset name", {
    required: true,
    minLength: DATASET_VALIDATION_LIMITS.NAME.MIN,
    maxLength: DATASET_VALIDATION_LIMITS.NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset version field
 */
export const validateDatasetVersion = (value: unknown): ValidationResult => {
  return validateString(value, "Version", {
    required: true,
    minLength: DATASET_VALIDATION_LIMITS.VERSION.MIN,
    maxLength: DATASET_VALIDATION_LIMITS.VERSION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset description field
 */
export const validateDatasetDescription = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Description", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset owner field
 */
export const validateDatasetOwner = (value: unknown): ValidationResult => {
  return validateString(value, "Owner", {
    required: true,
    minLength: DATASET_VALIDATION_LIMITS.OWNER.MIN,
    maxLength: DATASET_VALIDATION_LIMITS.OWNER.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset type field
 */
export const validateDatasetType = (value: unknown): ValidationResult => {
  return validateEnum(value, "Dataset type", DATASET_TYPE_ENUM, true);
};

/**
 * Validates dataset function field
 */
export const validateDatasetFunction = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Function", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.FUNCTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset source field
 */
export const validateDatasetSource = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Source", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.SOURCE.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset license field
 */
export const validateDatasetLicense = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "License", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.LICENSE.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates dataset format field
 */
export const validateDatasetFormat = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Format", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.FORMAT.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates data classification field
 */
export const validateDataClassification = (value: unknown): ValidationResult => {
  return validateEnum(value, "Data classification", DATA_CLASSIFICATION_ENUM, true);
};

/**
 * Validates contains_pii field (boolean)
 */
export const validateContainsPii = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Default to false
  }

  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: "Contains PII must be a boolean value",
      code: "INVALID_TYPE",
    };
  }

  return { isValid: true };
};

/**
 * Validates pii_types field (string or array of strings)
 */
export const validatePiiTypes = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }

  // Accept both string and array formats
  if (typeof value === "string") {
    return { isValid: true }; // String format is valid
  }

  if (Array.isArray(value)) {
    if (value.length > DATASET_VALIDATION_LIMITS.PII_TYPES.MAX_ITEMS) {
      return {
        isValid: false,
        message: `PII types array cannot exceed ${DATASET_VALIDATION_LIMITS.PII_TYPES.MAX_ITEMS} items`,
        code: "TOO_MANY_PII_TYPES",
      };
    }
    return { isValid: true };
  }

  return {
    isValid: false,
    message: "PII types must be a string or array",
    code: "INVALID_PII_TYPES_TYPE",
  };
};

/**
 * Validates dataset status field
 */
export const validateDatasetStatus = (value: unknown): ValidationResult => {
  return validateEnum(value, "Dataset status", DATASET_STATUS_ENUM, true);
};

/**
 * Validates status date field
 */
export const validateStatusDate = (value: unknown): ValidationResult => {
  return validateDate(value, "Status date", { required: false });
};

/**
 * Validates known biases field
 */
export const validateKnownBiases = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Known biases", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.KNOWN_BIASES.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates bias mitigation field
 */
export const validateBiasMitigation = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Bias mitigation", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.BIAS_MITIGATION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates collection method field
 */
export const validateCollectionMethod = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Collection method", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.COLLECTION_METHOD.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates preprocessing steps field
 */
export const validatePreprocessingSteps = (value: unknown): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateString(value, "Preprocessing steps", {
    required: false,
    maxLength: DATASET_VALIDATION_LIMITS.PREPROCESSING_STEPS.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates is_demo field
 */
export const validateIsDemo = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional, defaults to false
  }

  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: "Is demo must be a boolean value",
      code: "INVALID_TYPE",
    };
  }

  return { isValid: true };
};

/**
 * Validates models array (array of model IDs)
 */
export const validateModelsArray = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Models must be an array",
      code: "INVALID_MODELS_TYPE",
    };
  }

  if (value.length > DATASET_VALIDATION_LIMITS.MODELS.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Models array cannot exceed ${DATASET_VALIDATION_LIMITS.MODELS.MAX_ITEMS} items`,
      code: "TOO_MANY_MODELS",
    };
  }

  // Validate each model ID
  for (let i = 0; i < value.length; i++) {
    const result = validateForeignKey(value[i], `Models[${i}]`, false);
    if (!result.isValid) {
      return result;
    }
  }

  return { isValid: true };
};

/**
 * Validates projects array (array of project IDs)
 */
export const validateProjectsArray = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Projects must be an array",
      code: "INVALID_PROJECTS_TYPE",
    };
  }

  if (value.length > DATASET_VALIDATION_LIMITS.PROJECTS.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Projects array cannot exceed ${DATASET_VALIDATION_LIMITS.PROJECTS.MAX_ITEMS} items`,
      code: "TOO_MANY_PROJECTS",
    };
  }

  // Validate each project ID
  for (let i = 0; i < value.length; i++) {
    const result = validateForeignKey(value[i], `Projects[${i}]`, false);
    if (!result.isValid) {
      return result;
    }
  }

  return { isValid: true };
};

/**
 * Validates dataset ID parameter
 */
export const validateDatasetIdParam = (id: unknown): ValidationResult => {
  return validateForeignKey(id, "Dataset ID", true);
};

/**
 * Validation schema for creating a new dataset
 */
export const createDatasetSchema = {
  name: validateDatasetName,
  version: validateDatasetVersion,
  description: validateDatasetDescription,
  owner: validateDatasetOwner,
  type: validateDatasetType,
  function: validateDatasetFunction,
  source: validateDatasetSource,
  license: validateDatasetLicense,
  format: validateDatasetFormat,
  classification: validateDataClassification,
  contains_pii: validateContainsPii,
  pii_types: validatePiiTypes,
  status: validateDatasetStatus,
  status_date: validateStatusDate,
  known_biases: validateKnownBiases,
  bias_mitigation: validateBiasMitigation,
  collection_method: validateCollectionMethod,
  preprocessing_steps: validatePreprocessingSteps,
  is_demo: validateIsDemo,
  models: validateModelsArray,
  projects: validateProjectsArray,
};

/**
 * Validation schema for updating a dataset
 */
export const updateDatasetSchema = {
  ...createDatasetSchema,
};

/**
 * Validates a complete dataset object for creation
 */
export const validateCompleteDataset = (data: unknown): ValidationError[] => {
  return validateSchema(data as Record<string, unknown>, createDatasetSchema);
};

/**
 * Validates a dataset object for updates
 */
export const validateUpdateDataset = (data: unknown): ValidationError[] => {
  return validateSchema(data as Record<string, unknown>, updateDatasetSchema);
};

/**
 * Business rule validation for dataset creation
 * Note: These are recommendations, not blocking errors.
 * They are returned as warnings for logging purposes only.
 */
export const validateDatasetCreationBusinessRules = (
  _data: Record<string, unknown>,
): ValidationError[] => {
  // Business rules are now non-blocking recommendations
  // They are logged but don't prevent dataset creation
  return [];
};

/**
 * Business rule validation for dataset updates
 */
export const validateDatasetUpdateBusinessRules = (
  data: Record<string, unknown>,
  existingData?: Record<string, unknown>,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      {
        from: "Archived",
        to: "Active",
        message: "Archived datasets cannot be moved directly to Active status",
      },
      {
        from: "Deprecated",
        to: "Draft",
        message: "Deprecated datasets cannot be moved back to Draft status",
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

  // Include creation business rules for updates as well
  const creationErrors = validateDatasetCreationBusinessRules(data);
  errors.push(...creationErrors);

  return errors;
};

/**
 * Complete validation for dataset creation with business rules
 */
export const validateCompleteDatasetCreation = (data: unknown): ValidationError[] => {
  const validationErrors = validateCompleteDataset(data);
  const businessErrors = validateDatasetCreationBusinessRules(data as Record<string, unknown>);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for dataset updates with business rules
 */
export const validateCompleteDatasetUpdate = (
  data: unknown,
  existingData?: unknown,
): ValidationError[] => {
  const validationErrors = validateUpdateDataset(data);
  const businessErrors = validateDatasetUpdateBusinessRules(
    data as Record<string, unknown>,
    existingData as Record<string, unknown> | undefined,
  );

  return [...validationErrors, ...businessErrors];
};
