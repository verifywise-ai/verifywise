/**
 * ISO-42001 specific validation utilities
 * Contains validation schemas and functions specifically for ISO-42001 operations
 */

import {
  validateString,
  validateDate,
  validateForeignKey,
  validateEnum,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";
import { STATUSES } from "../../types/status.type";

/**
 * Boolean validation function (since not available in validation.utils)
 */
const validateBoolean = (
  value: any,
  fieldName: string,
  options: { required?: boolean } = {},
): ValidationResult => {
  const { required = false } = options;

  if (value === undefined || value === null) {
    if (required) {
      return {
        isValid: false,
        message: `${fieldName} is required`,
        code: "REQUIRED",
      };
    }
    return { isValid: true };
  }

  // Handle string representations of booleans (from FormData)
  if (typeof value === "string") {
    const lowerValue = value.toLowerCase();
    if (lowerValue === "true" || lowerValue === "false") {
      return { isValid: true };
    }
  }

  if (typeof value === "boolean") {
    return { isValid: true };
  }

  return {
    isValid: false,
    message: `${fieldName} must be a boolean value (true/false)`,
    code: "INVALID_TYPE",
  };
};

/**
 * Validation constants for ISO-42001
 */
export const ISO42001_VALIDATION_LIMITS = {
  IMPLEMENTATION_DESCRIPTION: { MIN: 1, MAX: 5000 },
  JUSTIFICATION_FOR_EXCLUSION: { MIN: 1, MAX: 2000 },
  AUDITOR_FEEDBACK: { MIN: 1, MAX: 2000 },
} as const;

/**
 * ISO-42001 validation enums
 */
export const ISO42001_ENUMS = {
  STATUS: STATUSES,
} as const;

/**
 * Validates implementation description field
 */
export const validateImplementationDescription = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Allow empty strings for optional fields
  }
  return validateString(value, "Implementation description", {
    required: false,
    minLength: ISO42001_VALIDATION_LIMITS.IMPLEMENTATION_DESCRIPTION.MIN,
    maxLength: ISO42001_VALIDATION_LIMITS.IMPLEMENTATION_DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates justification for exclusion field (specific to annex categories)
 * Conditional validation based on is_applicable value
 */
export const validateJustificationForExclusion = (
  value: any,
  isApplicable?: boolean,
): ValidationResult => {
  // If is_applicable is false, justification_for_exclusion is required
  if (isApplicable === false) {
    if (value === undefined || value === null || value === "") {
      return {
        isValid: false,
        message: "Justification for exclusion is required when annex is not applicable",
        code: "JUSTIFICATION_REQUIRED_FOR_NON_APPLICABLE",
      };
    }
    return validateString(value, "Justification for exclusion", {
      required: true,
      minLength: ISO42001_VALIDATION_LIMITS.JUSTIFICATION_FOR_EXCLUSION.MIN,
      maxLength: ISO42001_VALIDATION_LIMITS.JUSTIFICATION_FOR_EXCLUSION.MAX,
      trimWhitespace: true,
    });
  }

  // If is_applicable is true, justification_for_exclusion should not be present
  if (isApplicable === true) {
    if (value !== undefined && value !== null && value !== "") {
      return {
        isValid: false,
        message: "Justification for exclusion should not be provided when annex is applicable",
        code: "JUSTIFICATION_NOT_ALLOWED_FOR_APPLICABLE",
      };
    }
    return { isValid: true };
  }

  // If is_applicable is undefined/null, allow optional justification
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Allow empty values when is_applicable is not specified
  }
  return validateString(value, "Justification for exclusion", {
    required: false,
    minLength: ISO42001_VALIDATION_LIMITS.JUSTIFICATION_FOR_EXCLUSION.MIN,
    maxLength: ISO42001_VALIDATION_LIMITS.JUSTIFICATION_FOR_EXCLUSION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates auditor feedback field
 */
export const validateAuditorFeedback = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Allow empty strings for optional fields
  }
  return validateString(value, "Auditor feedback", {
    required: false,
    minLength: ISO42001_VALIDATION_LIMITS.AUDITOR_FEEDBACK.MIN,
    maxLength: ISO42001_VALIDATION_LIMITS.AUDITOR_FEEDBACK.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates status enum field
 */
export const validateStatus = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }
  return validateEnum(value, "Status", ISO42001_ENUMS.STATUS, false);
};

/**
 * Validates user ID (owner, reviewer, approver) field
 */
export const validateUserId = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateForeignKey(value, "User ID", false);
};

/**
 * Validates project ID field
 */
export const validateProjectId = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateForeignKey(value, "Project ID", false);
};

/**
 * Validates due date field
 */
export const validateDueDate = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateDate(value, "Due date", { required: false });
};

/**
 * Validates is applicable field (specific to annex categories)
 */
export const validateIsApplicable = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field, defaults to true
  }
  return validateBoolean(value, "Is applicable", { required: false });
};

/**
 * Validates risks delete array
 */
export const validateRisksDelete = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }

  let risksArray;

  // Handle both string (JSON) and array formats
  if (typeof value === "string") {
    if (value.trim() === "") {
      return { isValid: true }; // Empty string is valid
    }
    try {
      risksArray = JSON.parse(value);
    } catch (error) {
      return {
        isValid: false,
        message: "Risks delete must be a valid JSON array",
        code: "INVALID_JSON",
      };
    }
  } else {
    risksArray = value;
  }

  if (!Array.isArray(risksArray)) {
    return {
      isValid: false,
      message: "Risks delete must be an array",
      code: "INVALID_TYPE",
    };
  }

  // Validate each risk ID in the array
  for (let i = 0; i < risksArray.length; i++) {
    const riskIdValidation = validateForeignKey(risksArray[i], `Risk ID at index ${i}`, true);
    if (!riskIdValidation.isValid) {
      return {
        isValid: false,
        message: `${riskIdValidation.message} at index ${i}`,
        code: riskIdValidation.code,
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates risks mitigated array
 */
export const validateRisksMitigated = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }

  let risksArray;

  // Handle both string (JSON) and array formats
  if (typeof value === "string") {
    if (value.trim() === "") {
      return { isValid: true }; // Empty string is valid
    }
    try {
      risksArray = JSON.parse(value);
    } catch (error) {
      return {
        isValid: false,
        message: "Risks mitigated must be a valid JSON array",
        code: "INVALID_JSON",
      };
    }
  } else {
    risksArray = value;
  }

  if (!Array.isArray(risksArray)) {
    return {
      isValid: false,
      message: "Risks mitigated must be an array",
      code: "INVALID_TYPE",
    };
  }

  // Validate each risk ID in the array
  for (let i = 0; i < risksArray.length; i++) {
    const riskIdValidation = validateForeignKey(
      risksArray[i],
      `Mitigated risk ID at index ${i}`,
      true,
    );
    if (!riskIdValidation.isValid) {
      return {
        isValid: false,
        message: `${riskIdValidation.message} at index ${i}`,
        code: riskIdValidation.code,
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates files delete array
 */
export const validateFilesDelete = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  let filesToDelete;

  // Handle both string (JSON) and array formats
  if (typeof value === "string") {
    try {
      filesToDelete = JSON.parse(value);
    } catch (error) {
      return {
        isValid: false,
        message: "Files delete must be a valid JSON array",
        code: "INVALID_JSON",
      };
    }
  } else {
    filesToDelete = value;
  }

  if (!Array.isArray(filesToDelete)) {
    return {
      isValid: false,
      message: "Files delete must be an array",
      code: "INVALID_TYPE",
    };
  }

  // Validate each file ID in the array
  for (let i = 0; i < filesToDelete.length; i++) {
    const fileIdValidation = validateForeignKey(filesToDelete[i], `File ID at index ${i}`, true);
    if (!fileIdValidation.isValid) {
      return {
        isValid: false,
        message: `${fileIdValidation.message} at index ${i}`,
        code: fileIdValidation.code,
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates file uploads
 */
export const validateFileUploads = (files: any[]): ValidationResult => {
  if (!files || files.length === 0) {
    return { isValid: true }; // Optional files
  }

  const allowedTypes = ["pdf", "doc", "docx", "txt", "jpg", "jpeg", "png", "gif"];
  const maxFileSize = 10 * 1024 * 1024; // 10MB

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.originalname) {
      return {
        isValid: false,
        message: `File at index ${i} must have a name`,
        code: "MISSING_FILENAME",
      };
    }

    const fileExtension = file.originalname.split(".").pop()?.toLowerCase();
    if (!fileExtension || !allowedTypes.includes(fileExtension)) {
      return {
        isValid: false,
        message: `File at index ${i} has unsupported type. Allowed types: ${allowedTypes.join(", ")}`,
        code: "INVALID_FILE_TYPE",
      };
    }

    if (file.size > maxFileSize) {
      return {
        isValid: false,
        message: `File at index ${i} exceeds maximum size of 10MB`,
        code: "FILE_TOO_LARGE",
      };
    }
  }

  return { isValid: true };
};

/**
 * Parameter validation functions
 */

/**
 * Validates subclause ID parameter
 */
export const validateSubClauseIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "SubClause ID", true);
};

/**
 * Validates annex category ID parameter
 */
export const validateAnnexCategoryIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Annex Category ID", true);
};

/**
 * Validates project framework ID parameter
 */
export const validateProjectFrameworkIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Project Framework ID", true);
};

/**
 * Validation schema for updating ISO-42001 subclauses
 */
export const updateSubClauseSchema = {
  implementation_description: validateImplementationDescription,
  status: validateStatus,
  owner: validateUserId,
  reviewer: validateUserId,
  approver: validateUserId,
  due_date: validateDueDate,
  auditor_feedback: validateAuditorFeedback,
  // Risk management fields
  risksDelete: validateRisksDelete,
  risksMitigated: validateRisksMitigated,
  // File management
  delete: validateFilesDelete,
  // Optional fields for file operations (validated conditionally when files present)
  user_id: validateUserId,
  project_id: validateProjectId,
};

/**
 * Validation schema for updating ISO-42001 annex categories
 * Note: is_applicable and justification_for_exclusion are validated conditionally
 */
export const updateAnnexCategorySchema = {
  is_applicable: validateIsApplicable,
  implementation_description: validateImplementationDescription,
  status: validateStatus,
  owner: validateUserId,
  reviewer: validateUserId,
  approver: validateUserId,
  due_date: validateDueDate,
  auditor_feedback: validateAuditorFeedback,
  // Risk management fields
  risksDelete: validateRisksDelete,
  risksMitigated: validateRisksMitigated,
  // File management
  delete: validateFilesDelete,
  // Optional fields for file operations (validated conditionally when files present)
  user_id: validateUserId,
  project_id: validateProjectId,
};

/**
 * Validates subclause update data
 */
export const validateUpdateSubClause = (
  data: any,
  skipFileFields: boolean = false,
): ValidationError[] => {
  // Create a copy of the schema, excluding user_id and project_id if skipFileFields is true
  const schemaToUse = skipFileFields
    ? Object.fromEntries(
        Object.entries(updateSubClauseSchema).filter(
          ([key]) => key !== "user_id" && key !== "project_id",
        ),
      )
    : updateSubClauseSchema;

  const errors = validateSchema(data, schemaToUse);

  // Check if at least some meaningful data is provided
  const meaningfulFields = [
    "implementation_description",
    "status",
    "owner",
    "reviewer",
    "approver",
    "due_date",
    "auditor_feedback",
    "risksDelete",
    "risksMitigated",
  ];

  const hasMeaningfulField = meaningfulFields.some(
    (field) => data[field] !== undefined && data[field] !== null && data[field] !== "",
  );

  if (!hasMeaningfulField) {
    errors.push({
      field: "body",
      message: "At least one meaningful field must be provided for update",
      code: "NO_UPDATE_FIELDS",
    });
  }

  return errors;
};

/**
 * Validates annex category update data
 * Includes conditional validation for is_applicable and justification_for_exclusion
 */
export const validateUpdateAnnexCategory = (
  data: any,
  skipFileFields: boolean = false,
): ValidationError[] => {
  // Create a copy of the schema, excluding user_id and project_id if skipFileFields is true
  const schemaToUse = skipFileFields
    ? Object.fromEntries(
        Object.entries(updateAnnexCategorySchema).filter(
          ([key]) => key !== "user_id" && key !== "project_id",
        ),
      )
    : updateAnnexCategorySchema;

  const errors = validateSchema(data, schemaToUse);

  // Conditional validation for justification_for_exclusion based on is_applicable
  const justificationValidation = validateJustificationForExclusion(
    data.justification_for_exclusion,
    data.is_applicable,
  );

  if (!justificationValidation.isValid) {
    errors.push({
      field: "justification_for_exclusion",
      message: justificationValidation.message || "Justification for exclusion validation failed",
      code: justificationValidation.code || "VALIDATION_FAILED",
    });
  }

  // If is_applicable is false, only justification_for_exclusion should be provided
  if (data.is_applicable === false) {
    const restrictedFields = [
      "implementation_description",
      "status",
      "owner",
      "reviewer",
      "approver",
      "due_date",
      "auditor_feedback",
      "risksDelete",
      "risksMitigated",
    ];

    for (const field of restrictedFields) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== "") {
        errors.push({
          field: field,
          message: `${field.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())} should not be provided when annex is not applicable`,
          code: "FIELD_NOT_ALLOWED_FOR_NON_APPLICABLE",
        });
      }
    }

    // For non-applicable annexes, only check if justification_for_exclusion is provided
    if (
      data.justification_for_exclusion === undefined ||
      data.justification_for_exclusion === null ||
      data.justification_for_exclusion === ""
    ) {
      // This error is already handled by validateJustificationForExclusion
    } else {
      // If justification is provided, that's sufficient for non-applicable annexes
      return errors;
    }
  } else {
    // For applicable annexes or unspecified is_applicable, check meaningful fields
    const meaningfulFields = [
      "is_applicable",
      "justification_for_exclusion",
      "implementation_description",
      "status",
      "owner",
      "reviewer",
      "approver",
      "due_date",
      "auditor_feedback",
      "risksDelete",
      "risksMitigated",
    ];

    const hasMeaningfulField = meaningfulFields.some(
      (field) => data[field] !== undefined && data[field] !== null && data[field] !== "",
    );

    if (!hasMeaningfulField) {
      errors.push({
        field: "body",
        message: "At least one meaningful field must be provided for update",
        code: "NO_UPDATE_FIELDS",
      });
    }
  }

  return errors;
};

/**
 * Sanitizes annex category data based on is_applicable value
 * Ensures justification_for_exclusion is handled correctly and removes inappropriate fields
 */
export const sanitizeAnnexCategoryData = (data: any): any => {
  const sanitizedData = { ...data };

  // If is_applicable is true, remove justification_for_exclusion
  if (data.is_applicable === true) {
    sanitizedData.justification_for_exclusion = null;
  }

  // If is_applicable is false, remove all other content fields except justification_for_exclusion
  if (data.is_applicable === false) {
    const fieldsToRemove = [
      "implementation_description",
      "status",
      "owner",
      "reviewer",
      "approver",
      "due_date",
      "auditor_feedback",
      "risksDelete",
      "risksMitigated",
    ];

    fieldsToRemove.forEach((field) => {
      if (sanitizedData[field] !== undefined) {
        delete sanitizedData[field];
      }
    });
  }

  return sanitizedData;
};

/**
 * Complete validation for ISO-42001 subclause updates
 */
export const validateCompleteSubClauseUpdate = (data: any, files?: any[]): ValidationError[] => {
  const hasFiles = files && files.length > 0;

  // Skip user_id and project_id validation if no files are present
  const errors = validateUpdateSubClause(data, !hasFiles);

  // Add file validation if files are present
  if (hasFiles) {
    const fileValidation = validateFileUploads(files);
    if (!fileValidation.isValid) {
      errors.push({
        field: "files",
        message: fileValidation.message || "File validation failed",
        code: fileValidation.code || "FILE_VALIDATION_FAILED",
      });
    }

    // Validate user_id and project_id are present when files are being uploaded
    const userIdValidation = validateForeignKey(data.user_id, "User ID", true);
    if (!userIdValidation.isValid) {
      errors.push({
        field: "user_id",
        message: userIdValidation.message || "User ID is required when uploading files",
        code: userIdValidation.code || "USER_ID_REQUIRED_FOR_FILES",
      });
    }

    const projectIdValidation = validateForeignKey(data.project_id, "Project ID", true);
    if (!projectIdValidation.isValid) {
      errors.push({
        field: "project_id",
        message: projectIdValidation.message || "Project ID is required when uploading files",
        code: projectIdValidation.code || "PROJECT_ID_REQUIRED_FOR_FILES",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for ISO-42001 annex category updates
 */
export const validateCompleteAnnexCategoryUpdate = (
  data: any,
  files?: any[],
): ValidationError[] => {
  const hasFiles = files && files.length > 0;

  // Skip user_id and project_id validation if no files are present
  const errors = validateUpdateAnnexCategory(data, !hasFiles);

  // Add file validation if files are present
  if (hasFiles) {
    const fileValidation = validateFileUploads(files);
    if (!fileValidation.isValid) {
      errors.push({
        field: "files",
        message: fileValidation.message || "File validation failed",
        code: fileValidation.code || "FILE_VALIDATION_FAILED",
      });
    }

    // Validate user_id and project_id are present when files are being uploaded
    const userIdValidation = validateForeignKey(data.user_id, "User ID", true);
    if (!userIdValidation.isValid) {
      errors.push({
        field: "user_id",
        message: userIdValidation.message || "User ID is required when uploading files",
        code: userIdValidation.code || "USER_ID_REQUIRED_FOR_FILES",
      });
    }

    const projectIdValidation = validateForeignKey(data.project_id, "Project ID", true);
    if (!projectIdValidation.isValid) {
      errors.push({
        field: "project_id",
        message: projectIdValidation.message || "Project ID is required when uploading files",
        code: projectIdValidation.code || "PROJECT_ID_REQUIRED_FOR_FILES",
      });
    }
  }

  return errors;
};
