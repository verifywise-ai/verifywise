/**
 * ISO-27001 specific validation utilities
 * Contains validation schemas and functions specifically for ISO-27001 operations
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
 * Validation constants for ISO-27001
 */
export const ISO27001_VALIDATION_LIMITS = {
  IMPLEMENTATION_DESCRIPTION: { MIN: 1, MAX: 5000 },
  AUDITOR_FEEDBACK: { MIN: 1, MAX: 2000 },
} as const;

/**
 * ISO-27001 validation enums
 */
export const ISO27001_ENUMS = {
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
    minLength: ISO27001_VALIDATION_LIMITS.IMPLEMENTATION_DESCRIPTION.MIN,
    maxLength: ISO27001_VALIDATION_LIMITS.IMPLEMENTATION_DESCRIPTION.MAX,
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
    minLength: ISO27001_VALIDATION_LIMITS.AUDITOR_FEEDBACK.MIN,
    maxLength: ISO27001_VALIDATION_LIMITS.AUDITOR_FEEDBACK.MAX,
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
  return validateEnum(value, "Status", ISO27001_ENUMS.STATUS, false);
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
 * Validates annex control ID parameter
 */
export const validateAnnexControlIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Annex Control ID", true);
};

/**
 * Validates project framework ID parameter
 */
export const validateProjectFrameworkIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Project Framework ID", true);
};

/**
 * Validates clause ID parameter
 */
export const validateClauseIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Clause ID", true);
};

/**
 * Validates annex ID parameter
 */
export const validateAnnexIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Annex ID", true);
};

/**
 * Validation schema for updating ISO-27001 subclauses
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
 * Validation schema for updating ISO-27001 annex controls
 */
export const updateAnnexControlSchema = {
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
 * Validates annex control update data
 */
export const validateUpdateAnnexControl = (
  data: any,
  skipFileFields: boolean = false,
): ValidationError[] => {
  // Create a copy of the schema, excluding user_id and project_id if skipFileFields is true
  const schemaToUse = skipFileFields
    ? Object.fromEntries(
        Object.entries(updateAnnexControlSchema).filter(
          ([key]) => key !== "user_id" && key !== "project_id",
        ),
      )
    : updateAnnexControlSchema;

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
 * Complete validation for ISO-27001 subclause updates
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
 * Complete validation for ISO-27001 annex control updates
 */
export const validateCompleteAnnexControlUpdate = (data: any, files?: any[]): ValidationError[] => {
  const hasFiles = files && files.length > 0;

  // Skip user_id and project_id validation if no files are present
  const errors = validateUpdateAnnexControl(data, !hasFiles);

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
