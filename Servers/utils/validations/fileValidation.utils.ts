/**
 * File specific validation utilities
 * Contains validation schemas and functions specifically for file operations
 */

import {
  validateNumber,
  validateString,
  validateForeignKey,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for files
 */
export const FILE_VALIDATION_LIMITS = {
  PAGE: { MIN: 1, MAX: 1000 },
  PAGE_SIZE: { MIN: 1, MAX: 100 },
  MAX_FILES_PER_UPLOAD: 10,
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/json",
  ],
} as const;

/**
 * Validates file ID parameter
 */
export const validateFileIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "File ID", true);
};

/**
 * Validates project ID parameter for file operations
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Project ID", true);
};

/**
 * Validates user ID parameter
 */
export const validateUserIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "User ID", true);
};

/**
 * Validates pagination parameters
 */
export const validatePaginationParams = (
  page: any,
  pageSize: any
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (page !== undefined) {
    const pageValidation = validateNumber(page, "Page", {
      required: false,
      min: FILE_VALIDATION_LIMITS.PAGE.MIN,
      max: FILE_VALIDATION_LIMITS.PAGE.MAX,
      integer: true,
    });
    if (!pageValidation.isValid) {
      errors.push({
        field: "page",
        message: pageValidation.message || "Invalid page parameter",
        code: pageValidation.code || "INVALID_PAGE",
      });
    }
  }

  if (pageSize !== undefined) {
    const pageSizeValidation = validateNumber(pageSize, "Page size", {
      required: false,
      min: FILE_VALIDATION_LIMITS.PAGE_SIZE.MIN,
      max: FILE_VALIDATION_LIMITS.PAGE_SIZE.MAX,
      integer: true,
    });
    if (!pageSizeValidation.isValid) {
      errors.push({
        field: "pageSize",
        message: pageSizeValidation.message || "Invalid page size parameter",
        code: pageSizeValidation.code || "INVALID_PAGE_SIZE",
      });
    }
  }

  return errors;
};

/**
 * Validates file upload body parameters
 */
export const validateFileUploadBody = async (
  body: any,
  _organizationId: number
): Promise<ValidationError[]> => {
  const errors: ValidationError[] = [];

  // Validate question_id (required)
  const questionIdValidation = validateForeignKey(
    body.question_id,
    "Question ID",
    true
  );
  if (!questionIdValidation.isValid) {
    errors.push({
      field: "question_id",
      message: questionIdValidation.message || "Question ID is required",
      code: questionIdValidation.code || "MISSING_QUESTION_ID",
    });
  }

  // Validate project_id (required)
  const projectIdValidation = validateForeignKey(
    body.project_id,
    "Project ID",
    true
  );
  if (!projectIdValidation.isValid) {
    errors.push({
      field: "project_id",
      message: projectIdValidation.message || "Project ID is required",
      code: projectIdValidation.code || "MISSING_PROJECT_ID",
    });
  }

  // Validate user_id (required)
  const userIdValidation = validateForeignKey(body.user_id, "User ID", true);
  if (!userIdValidation.isValid) {
    errors.push({
      field: "user_id",
      message: userIdValidation.message || "User ID is required",
      code: userIdValidation.code || "MISSING_USER_ID",
    });
  }

  // Validate delete parameter (should be valid JSON array)
  if (body.delete !== undefined) {
    try {
      const deleteArray = JSON.parse(body.delete);
      if (!Array.isArray(deleteArray)) {
        errors.push({
          field: "delete",
          message: "Delete parameter must be a JSON array of file IDs",
          code: "INVALID_DELETE_FORMAT",
        });
      } else {
        // Validate each file ID in delete array
        for (let i = 0; i < deleteArray.length; i++) {
          const fileIdValidation = validateForeignKey(
            deleteArray[i],
            `Delete file ID at index ${i}`,
            true
          );
          if (!fileIdValidation.isValid) {
            errors.push({
              field: "delete",
              message: `Invalid file ID at index ${i} in delete array`,
              code: "INVALID_DELETE_FILE_ID",
            });
          }
          // await validateFileDelete(deleteArray[i], body.question_id, tenant);
        }
      }
    } catch (error) {
      errors.push({
        field: "delete",
        message: "Delete parameter must be valid JSON",
        code: "INVALID_DELETE_JSON",
      });
    }
  }

  return errors;
};

/**
 * Validates uploaded files
 */
export const validateUploadedFiles = (files: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!files || !Array.isArray(files)) {
    return errors; // Files are optional for this endpoint
  }

  // Check file count limit
  if (files.length > FILE_VALIDATION_LIMITS.MAX_FILES_PER_UPLOAD) {
    errors.push({
      field: "files",
      message: `Maximum ${FILE_VALIDATION_LIMITS.MAX_FILES_PER_UPLOAD} files allowed per upload`,
      code: "TOO_MANY_FILES",
    });
    return errors; // Return early to avoid processing too many files
  }

  // Validate each file
  files.forEach((file: any, index: number) => {
    // Check if file has required properties
    if (!file.originalname) {
      errors.push({
        field: `files[${index}]`,
        message: `File at index ${index} is missing original name`,
        code: "MISSING_FILENAME",
      });
    }

    if (!file.mimetype) {
      errors.push({
        field: `files[${index}]`,
        message: `File at index ${index} is missing MIME type`,
        code: "MISSING_MIMETYPE",
      });
    }

    if (!file.size && file.size !== 0) {
      errors.push({
        field: `files[${index}]`,
        message: `File at index ${index} is missing size information`,
        code: "MISSING_FILE_SIZE",
      });
    }

    // Validate file size
    if (file.size && file.size > FILE_VALIDATION_LIMITS.MAX_FILE_SIZE) {
      errors.push({
        field: `files[${index}]`,
        message: `File "${file.originalname}" exceeds maximum size of ${FILE_VALIDATION_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        code: "FILE_TOO_LARGE",
      });
    }

    // Validate MIME type
    if (
      file.mimetype &&
      !FILE_VALIDATION_LIMITS.ALLOWED_MIME_TYPES.includes(file.mimetype)
    ) {
      errors.push({
        field: `files[${index}]`,
        message: `File "${file.originalname}" has unsupported MIME type: ${file.mimetype}`,
        code: "UNSUPPORTED_FILE_TYPE",
      });
    }

    // Validate filename
    if (file.originalname) {
      const filenameValidation = validateString(
        file.originalname,
        `File name at index ${index}`,
        {
          required: true,
          minLength: 1,
          maxLength: 255,
          trimWhitespace: true,
        }
      );
      if (!filenameValidation.isValid) {
        errors.push({
          field: `files[${index}]`,
          message:
            filenameValidation.message || `Invalid filename at index ${index}`,
          code: filenameValidation.code || "INVALID_FILENAME",
        });
      }
    }
  });

  return errors;
};

/**
 * Complete validation for file upload request
 */
export const validateFileUploadRequest = async (
  body: any,
  files: any,
  organizationId: number
): Promise<ValidationError[]> => {
  const bodyErrors = await validateFileUploadBody(body, organizationId);
  const fileErrors = validateUploadedFiles(files);

  return [...bodyErrors, ...fileErrors];
};

/**
 * Business rule validation for file operations
 */
export const validateFileBusinessRules = (
  body: any,
  files: any
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // If files are being uploaded, ensure required fields are present
  if (files && Array.isArray(files) && files.length > 0) {
    if (!body.project_id) {
      errors.push({
        field: "project_id",
        message: "Project ID is required when uploading files",
        code: "MISSING_PROJECT_FOR_UPLOAD",
      });
    }

    if (!body.user_id) {
      errors.push({
        field: "user_id",
        message: "User ID is required when uploading files",
        code: "MISSING_USER_FOR_UPLOAD",
      });
    }
  }

  // If deleting files but no files to upload, ensure delete array is provided
  if (
    (!files || files.length === 0) &&
    (!body.delete || body.delete === "[]")
  ) {
    errors.push({
      field: "request",
      message: "Either files to upload or files to delete must be specified",
      code: "NO_OPERATION_SPECIFIED",
    });
  }

  return errors;
};

/**
 * Complete validation for file upload with business rules
 */
export const validateCompleteFileUpload = async (
  body: any,
  files: any,
  organizationId: number
): Promise<ValidationError[]> => {
  const validationErrors = await validateFileUploadRequest(body, files, organizationId);
  const businessErrors = validateFileBusinessRules(body, files);

  return [...validationErrors, ...businessErrors];
};
