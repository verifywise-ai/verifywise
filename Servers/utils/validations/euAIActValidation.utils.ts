/**
 * EU AI Act specific validation utilities
 * Contains validation schemas and functions specifically for EU AI Act operations
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
 * Validation constants for EU AI Act
 */
export const EU_AI_ACT_VALIDATION_LIMITS = {
  IMPLEMENTATION_DETAILS: { MIN: 1, MAX: 2000 },
  RISK_REVIEW: { MIN: 1, MAX: 500 },
  EVIDENCE_DESCRIPTION: { MIN: 1, MAX: 1000 },
  FEEDBACK_DESCRIPTION: { MIN: 1, MAX: 1000 },
  ANSWER: { MIN: 1, MAX: 5000 },
} as const;

/**
 * EU AI Act validation enums
 */
export const EU_AI_ACT_ENUMS = {
  CONTROL_STATUS: ["Waiting", "In progress", "Done"] as const,
  SUBCONTROL_STATUS: ["Waiting", "In progress", "Done"] as const,
  RISK_REVIEW: ["Acceptable risk", "Residual risk", "Unacceptable risk"] as const,
  ANSWER_STATUS: ["Not started", "In progress", "Done"] as const,
} as const;

/**
 * Validates EU AI Act control/answer ID parameter
 */
export const validateEUIDAParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "EU AI Act ID", true);
};

/**
 * Validates project framework ID parameter
 */
export const validateProjectFrameworkIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Project framework ID", true);
};

/**
 * Validates topic ID parameter
 */
export const validateTopicIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Topic ID", true);
};

/**
 * Validates control ID parameter
 */
export const validateControlIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Control ID", true);
};

/**
 * Validates control category ID parameter
 */
export const validateControlCategoryIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Control category ID", true);
};

// Title and description validation removed - these fields are not updatable in EU AI Act controls

/**
 * Validates implementation details field
 */
export const validateImplementationDetails = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Allow empty strings for optional fields
  }
  return validateString(value, "Implementation details", {
    required: false,
    minLength: EU_AI_ACT_VALIDATION_LIMITS.IMPLEMENTATION_DETAILS.MIN,
    maxLength: EU_AI_ACT_VALIDATION_LIMITS.IMPLEMENTATION_DETAILS.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates evidence description field
 */
export const validateEvidenceDescription = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Allow empty strings for optional fields
  }
  return validateString(value, "Evidence description", {
    required: false,
    minLength: EU_AI_ACT_VALIDATION_LIMITS.EVIDENCE_DESCRIPTION.MIN,
    maxLength: EU_AI_ACT_VALIDATION_LIMITS.EVIDENCE_DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates feedback description field
 */
export const validateFeedbackDescription = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Allow empty strings for optional fields
  }
  return validateString(value, "Feedback description", {
    required: false,
    minLength: EU_AI_ACT_VALIDATION_LIMITS.FEEDBACK_DESCRIPTION.MIN,
    maxLength: EU_AI_ACT_VALIDATION_LIMITS.FEEDBACK_DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates answer field
 */
export const validateAnswer = (value: any): ValidationResult => {
  return validateString(value, "Answer", {
    required: false, // Optional
    minLength: EU_AI_ACT_VALIDATION_LIMITS.ANSWER.MIN,
    maxLength: EU_AI_ACT_VALIDATION_LIMITS.ANSWER.MAX,
    trimWhitespace: true,
  });
};

// Comment field removed - not present in AnswerEU model

/**
 * Validates control status enum field
 */
export const validateControlStatus = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }
  return validateEnum(value, "Control status", EU_AI_ACT_ENUMS.CONTROL_STATUS, false);
};

/**
 * Validates subcontrol status enum field
 */
export const validateSubcontrolStatus = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }
  return validateEnum(value, "Subcontrol status", EU_AI_ACT_ENUMS.SUBCONTROL_STATUS, false);
};

/**
 * Validates risk review enum field
 */
export const validateRiskReview = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }
  return validateEnum(value, "Risk review", EU_AI_ACT_ENUMS.RISK_REVIEW, false);
};

/**
 * Validates answer status enum field
 */
export const validateAnswerStatus = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }
  return validateEnum(value, "Answer status", EU_AI_ACT_ENUMS.ANSWER_STATUS, false);
};

/**
 * Validates user ID (approver, owner, reviewer) field
 */
export const validateUserId = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }
  return validateForeignKey(value, "User ID", false);
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

// Order number validation removed - this field is not updatable in EU AI Act controls

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
 * Validates subcontrols JSON string
 */
export const validateSubControls = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }

  if (typeof value !== "string") {
    return {
      isValid: false,
      message: "SubControls must be a JSON string",
      code: "INVALID_TYPE",
    };
  }

  let subControls;
  try {
    subControls = JSON.parse(value);
  } catch (error) {
    return {
      isValid: false,
      message: "SubControls must be valid JSON",
      code: "INVALID_JSON",
    };
  }

  if (!Array.isArray(subControls)) {
    return {
      isValid: false,
      message: "SubControls JSON must contain an array",
      code: "INVALID_JSON_STRUCTURE",
    };
  }

  // Validate each subcontrol in the array
  for (let i = 0; i < subControls.length; i++) {
    const subcontrol = subControls[i];

    // Validate subcontrol has required structure
    if (typeof subcontrol !== "object" || subcontrol === null) {
      return {
        isValid: false,
        message: `SubControl at index ${i} must be an object`,
        code: "INVALID_SUBCONTROL_TYPE",
      };
    }

    // Validate subcontrol ID if present
    if (subcontrol.id !== undefined) {
      const idValidation = validateForeignKey(subcontrol.id, `SubControl ID at index ${i}`, false);
      if (!idValidation.isValid) {
        return {
          isValid: false,
          message: `${idValidation.message} at index ${i}`,
          code: idValidation.code,
        };
      }
    }

    // Validate subcontrol status if present
    if (subcontrol.status !== undefined) {
      const statusValidation = validateSubcontrolStatus(subcontrol.status);
      if (!statusValidation.isValid) {
        return {
          isValid: false,
          message: `SubControl status validation failed at index ${i}: ${statusValidation.message}`,
          code: statusValidation.code,
        };
      }
    }

    // Validate risk review if present
    if (subcontrol.risk_review !== undefined) {
      const riskReviewValidation = validateRiskReview(subcontrol.risk_review);
      if (!riskReviewValidation.isValid) {
        return {
          isValid: false,
          message: `SubControl risk review validation failed at index ${i}: ${riskReviewValidation.message}`,
          code: riskReviewValidation.code,
        };
      }
    }

    // Validate user IDs if present
    const userFields = ["approver", "owner", "reviewer"];
    for (const field of userFields) {
      if (subcontrol[field] !== undefined) {
        const userValidation = validateUserId(subcontrol[field]);
        if (!userValidation.isValid) {
          return {
            isValid: false,
            message: `SubControl ${field} validation failed at index ${i}: ${userValidation.message}`,
            code: userValidation.code,
          };
        }
      }
    }

    // Validate due date if present
    if (subcontrol.due_date !== undefined) {
      const dueDateValidation = validateDueDate(subcontrol.due_date);
      if (!dueDateValidation.isValid) {
        return {
          isValid: false,
          message: `SubControl due date validation failed at index ${i}: ${dueDateValidation.message}`,
          code: dueDateValidation.code,
        };
      }
    }

    // Validate text fields if present
    const textFields = [
      {
        field: "implementation_details",
        validator: validateImplementationDetails,
      },
      { field: "evidence_description", validator: validateEvidenceDescription },
      { field: "feedback_description", validator: validateFeedbackDescription },
    ];

    for (const { field, validator } of textFields) {
      if (subcontrol[field] !== undefined) {
        const fieldValidation = validator(subcontrol[field]);
        if (!fieldValidation.isValid) {
          return {
            isValid: false,
            message: `SubControl ${field} validation failed at index ${i}: ${fieldValidation.message}`,
            code: fieldValidation.code,
          };
        }
      }
    }
  }

  return { isValid: true };
};

/**
 * Validation schema for updating EU AI Act controls
 * Only includes fields that are actually updatable according to updateControlEUByIdQuery
 */
export const updateControlSchema = {
  // Actually updatable control fields
  status: validateControlStatus,
  approver: validateUserId,
  risk_review: validateRiskReview,
  owner: validateUserId,
  reviewer: validateUserId,
  due_date: validateDueDate,
  implementation_details: validateImplementationDetails,

  // Risk management fields
  risksDelete: validateRisksDelete,
  risksMitigated: validateRisksMitigated,

  // File and subcontrol management
  subControls: validateSubControls,
  delete: validateFilesDelete,

  // Required for file operations
  user_id: (value: any) => validateForeignKey(value, "User ID", true),
  project_id: (value: any) => validateForeignKey(value, "Project ID", true),
};

/**
 * Validation schema for updating EU AI Act answers
 */
export const updateAnswerSchema = {
  answer: validateAnswer,
  status: validateAnswerStatus,
  risksDelete: validateRisksDelete,
  risksMitigated: validateRisksMitigated,
};

/**
 * Validates control update data
 */
export const validateUpdateControl = (data: any): ValidationError[] => {
  const errors = validateSchema(data, updateControlSchema);

  // Check if at least some meaningful data is provided (only actually updatable fields)
  const meaningfulFields = [
    "status",
    "approver",
    "risk_review",
    "owner",
    "reviewer",
    "due_date",
    "implementation_details",
    "subControls",
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
 * Validates answer update data
 */
export const validateUpdateAnswer = (data: any): ValidationError[] => {
  const errors = validateSchema(data, updateAnswerSchema);

  // Check if at least some meaningful data is provided
  const meaningfulFields = ["answer", "status", "risksDelete", "risksMitigated"];

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
 * Validates project framework ID query parameter
 */
export const validateProjectFrameworkIdQuery = (value: any): ValidationResult => {
  return validateProjectFrameworkIdParam(value);
};

/**
 * Validates topic ID query parameter
 */
export const validateTopicIdQuery = (value: any): ValidationResult => {
  return validateTopicIdParam(value);
};

/**
 * Validates control ID query parameter
 */
export const validateControlIdQuery = (value: any): ValidationResult => {
  return validateControlIdParam(value);
};

/**
 * Business logic validations
 */

/**
 * Validates that files are uploaded correctly (for file upload validation)
 */
export const validateFileUploads = (files: any[]): ValidationResult => {
  if (!files || !Array.isArray(files)) {
    return { isValid: true }; // Files are optional
  }

  // Check file size and type constraints
  const maxFileSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/csv",
  ];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (file.size > maxFileSize) {
      return {
        isValid: false,
        message: `File "${file.originalname}" exceeds maximum size of 10MB`,
        code: "FILE_SIZE_EXCEEDED",
      };
    }

    if (!allowedTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        message: `File "${file.originalname}" has unsupported format. Allowed formats: images, PDF, Word documents, text files`,
        code: "UNSUPPORTED_FILE_TYPE",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates EU AI Act control ID parameter
 */
export const validateEUControlIdParam = (id: any): ValidationResult => {
  return validateEUIDAParam(id);
};

/**
 * Validates EU AI Act answer ID parameter
 */
export const validateEUAnswerIdParam = (id: any): ValidationResult => {
  return validateEUIDAParam(id);
};

/**
 * Complete validation for EU AI Act control updates
 */
export const validateCompleteControlUpdate = (data: any, files?: any[]): ValidationError[] => {
  const errors = validateUpdateControl(data);

  // Add file validation if files are present
  if (files && files.length > 0) {
    const fileValidation = validateFileUploads(files);
    if (!fileValidation.isValid) {
      errors.push({
        field: "files",
        message: fileValidation.message || "File validation failed",
        code: fileValidation.code || "FILE_VALIDATION_FAILED",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for EU AI Act answer updates
 */
export const validateCompleteAnswerUpdate = (data: any): ValidationError[] => {
  return validateUpdateAnswer(data);
};
