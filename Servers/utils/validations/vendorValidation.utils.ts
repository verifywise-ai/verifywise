/**
 * Vendor specific validation utilities
 * Contains validation schemas and functions specifically for vendor operations
 */

import {
  validateString,
  validateEnum,
  validateDate,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
  VALIDATION_PATTERNS,
} from "./validation.utils";

/**
 * Validation constants for vendors
 */
export const VENDOR_VALIDATION_LIMITS = {
  VENDOR_NAME: { MIN: 1, MAX: 255 },
  VENDOR_PROVIDES: { MIN: 1, MAX: 500 },
  WEBSITE: { MIN: 1, MAX: 255 },
  VENDOR_CONTACT_PERSON: { MIN: 1, MAX: 255 },
  REVIEW_RESULT: { MIN: 1, MAX: 1000 },
} as const;

/**
 * Vendor review status enum
 */
export const VENDOR_REVIEW_STATUS_ENUM = [
  "Not started",
  "In review",
  "Reviewed",
  "Requires follow-up",
] as const;

/**
 * Vendor scorecard enums
 */
export const VENDOR_DATA_SENSITIVITY_ENUM = [
  "None",
  "Internal only",
  "Personally identifiable information (PII)",
  "Financial data",
  "Health data (e.g. HIPAA)",
  "Model weights or AI assets",
  "Other sensitive data",
] as const;

export const VENDOR_BUSINESS_CRITICALITY_ENUM = [
  "Low (vendor supports non-core functions)",
  "Medium (affects operations but is replaceable)",
  "High (critical to core services or products)",
] as const;

export const VENDOR_PAST_ISSUES_ENUM = [
  "None",
  "Minor incident (e.g. small delay, minor bug)",
  "Major incident (e.g. data breach, legal issue)",
] as const;

export const VENDOR_REGULATORY_EXPOSURE_ENUM = [
  "None",
  "GDPR (EU)",
  "HIPAA (US)",
  "SOC 2",
  "ISO 27001",
  "EU AI act",
  "CCPA (california)",
  "Other",
] as const;

/**
 * Validates vendor name field
 */
export const validateVendorName = (value: any): ValidationResult => {
  return validateString(value, "Vendor name", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.VENDOR_NAME.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.VENDOR_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates vendor provides field (what services/products the vendor provides)
 */
export const validateVendorProvides = (value: any): ValidationResult => {
  return validateString(value, "Vendor provides", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.VENDOR_PROVIDES.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.VENDOR_PROVIDES.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates website field with URL pattern
 */
export const validateWebsite = (value: any): ValidationResult => {
  // First validate as string
  const stringValidation = validateString(value, "Website", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.WEBSITE.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.WEBSITE.MAX,
    trimWhitespace: true,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // Then validate URL format (basic validation)
  const urlPattern = /^https?:\/\/.+\..+/;
  if (!urlPattern.test(value.trim())) {
    return {
      isValid: false,
      message: "Website must be a valid URL (starting with http:// or https://)",
      code: "INVALID_URL_FORMAT",
    };
  }

  return { isValid: true };
};

/**
 * Validates vendor contact person field
 */
export const validateVendorContactPerson = (value: any): ValidationResult => {
  return validateString(value, "Vendor contact person", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.VENDOR_CONTACT_PERSON.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.VENDOR_CONTACT_PERSON.MAX,
    trimWhitespace: true,
    pattern: VALIDATION_PATTERNS.LETTERS_ONLY, // Only letters and spaces allowed
  });
};

/**
 * Validates review result field
 */
export const validateReviewResult = (value: any): ValidationResult => {
  return validateString(value, "Review result", {
    required: false,
    minLength: VENDOR_VALIDATION_LIMITS.REVIEW_RESULT.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.REVIEW_RESULT.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates review status enum field
 */
export const validateReviewStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Review status", VENDOR_REVIEW_STATUS_ENUM, false);
};

/**
 * Validates data sensitivity enum field
 */
export const validateDataSensitivity = (value: any): ValidationResult => {
  return validateEnum(value, "Data sensitivity", VENDOR_DATA_SENSITIVITY_ENUM, false);
};

/**
 * Validates business criticality enum field
 */
export const validateBusinessCriticality = (value: any): ValidationResult => {
  return validateEnum(value, "Business criticality", VENDOR_BUSINESS_CRITICALITY_ENUM, false);
};

/**
 * Validates past issues enum field
 */
export const validatePastIssues = (value: any): ValidationResult => {
  return validateEnum(value, "Past issues", VENDOR_PAST_ISSUES_ENUM, false);
};

/**
 * Validates regulatory exposure enum field
 */
export const validateRegulatoryExposure = (value: any): ValidationResult => {
  return validateEnum(value, "Regulatory exposure", VENDOR_REGULATORY_EXPOSURE_ENUM, false);
};

/**
 * Validates assignee foreign key
 */
export const validateAssignee = (value: any): ValidationResult => {
  return validateForeignKey(value, "Assignee", true);
};

/**
 * Validates reviewer foreign key
 */
export const validateReviewer = (value: any): ValidationResult => {
  return validateForeignKey(value, "Reviewer", false);
};

/**
 * Validates review date field
 */
export const validateReviewDate = (value: any): ValidationResult => {
  return validateDate(value, "Review date", {
    required: false,
  });
};

/**
 * Validates vendor ID for existing records
 */
export const validateVendorId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Vendor ID", true);
};

/**
 * Validates project ID for queries
 */
export const validateProjectId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Project ID", true);
};

/**
 * Validates projects array field (required)
 */
export const validateProjects = (value: any): ValidationResult => {
  // Projects field is required
  if (value === undefined || value === null) {
    return {
      isValid: false,
      message: "Projects is required",
      code: "REQUIRED_FIELD",
    };
  }

  // Must be an array
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Projects must be an array",
      code: "INVALID_ARRAY",
    };
  }

  // Array cannot be empty since it's required
  if (value.length === 0) {
    return {
      isValid: false,
      message: "Projects array cannot be empty",
      code: "EMPTY_REQUIRED_ARRAY",
    };
  }

  // Validate each project ID in the array
  for (let i = 0; i < value.length; i++) {
    const projectId = value[i];
    const validation = validateForeignKey(projectId, `Project ID at index ${i}`, false);
    if (!validation.isValid) {
      return {
        isValid: false,
        message: `Invalid project ID at index ${i}: ${validation.message}`,
        code: validation.code || "INVALID_PROJECT_ID",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validation schema for creating a new vendor
 */
export const createVendorSchema = {
  vendor_name: validateVendorName,
  vendor_provides: validateVendorProvides,
  assignee: validateAssignee,
  website: validateWebsite,
  vendor_contact_person: validateVendorContactPerson,
  review_result: validateReviewResult,
  review_status: validateReviewStatus,
  reviewer: validateReviewer,
  review_date: validateReviewDate,
  projects: validateProjects,
  data_sensitivity: validateDataSensitivity,
  business_criticality: validateBusinessCriticality,
  past_issues: validatePastIssues,
  regulatory_exposure: validateRegulatoryExposure,
};

/**
 * Validation schema for updating a vendor
 * All fields are optional for updates
 */
export const updateVendorSchema = {
  vendor_name: (value: any) =>
    value !== undefined ? validateVendorName(value) : { isValid: true },
  vendor_provides: (value: any) =>
    value !== undefined ? validateVendorProvides(value) : { isValid: true },
  assignee: (value: any) => (value !== undefined ? validateAssignee(value) : { isValid: true }),
  website: (value: any) => (value !== undefined ? validateWebsite(value) : { isValid: true }),
  vendor_contact_person: (value: any) =>
    value !== undefined ? validateVendorContactPerson(value) : { isValid: true },
  review_result: (value: any) =>
    value !== undefined ? validateReviewResult(value) : { isValid: true },
  review_status: (value: any) =>
    value !== undefined ? validateReviewStatus(value) : { isValid: true },
  reviewer: (value: any) => (value !== undefined ? validateReviewer(value) : { isValid: true }),
  review_date: (value: any) =>
    value !== undefined ? validateReviewDate(value) : { isValid: true },
  projects: (value: any) => (value !== undefined ? validateProjects(value) : { isValid: true }),
  data_sensitivity: (value: any) =>
    value !== undefined ? validateDataSensitivity(value) : { isValid: true },
  business_criticality: (value: any) =>
    value !== undefined ? validateBusinessCriticality(value) : { isValid: true },
  past_issues: (value: any) =>
    value !== undefined ? validatePastIssues(value) : { isValid: true },
  regulatory_exposure: (value: any) =>
    value !== undefined ? validateRegulatoryExposure(value) : { isValid: true },
};

/**
 * Validates a complete vendor object for creation
 */
export const validateCompleteVendor = (data: any): ValidationError[] => {
  return validateSchema(data, createVendorSchema);
};

/**
 * Validates a vendor object for updates
 */
export const validateUpdateVendor = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = [
    "vendor_name",
    "vendor_provides",
    "assignee",
    "website",
    "vendor_contact_person",
    "review_result",
    "review_status",
    "reviewer",
    "review_date",
    "projects",
    "data_sensitivity",
    "business_criticality",
    "past_issues",
    "regulatory_exposure",
  ];

  const hasUpdateField = updateFields.some((field) => data[field] !== undefined);

  if (!hasUpdateField) {
    return [
      {
        field: "body",
        message: "At least one field must be provided for update",
        code: "NO_UPDATE_FIELDS",
      },
    ];
  }

  return validateSchema(data, updateVendorSchema);
};

/**
 * Validates vendor ID parameter
 */
export const validateVendorIdParam = (id: any): ValidationResult => {
  return validateVendorId(id);
};

/**
 * Validates project ID parameter
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateProjectId(id);
};

/**
 * Business logic validations
 */

/**
 * Validates that review status progression is logical
 */
export const validateReviewStatusProgression = (
  currentStatus: string,
  newStatus: string,
): ValidationResult => {
  // If status hasn't changed, it's always valid
  if (currentStatus === newStatus) {
    return { isValid: true, message: "", code: "" };
  }

  // Define valid status transitions
  const validTransitions: Record<string, string[]> = {
    "Not started": ["In review"],
    "In review": ["Reviewed", "Requires follow-up"],
    Reviewed: ["Requires follow-up"], // Can go back to follow-up if issues found
    "Requires follow-up": ["In review", "Reviewed"], // Can go back to review or directly to reviewed
  };

  const allowedStatuses = validTransitions[currentStatus] || [];

  if (!allowedStatuses.includes(newStatus)) {
    return {
      isValid: false,
      message: `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowedStatuses.join(", ")}`,
      code: "INVALID_STATUS_TRANSITION",
    };
  }

  return { isValid: true, message: "", code: "" };
};

/**
 * Validates that review date is not in the future for completed reviews
 */
export const validateReviewDateConsistency = (
  reviewStatus: string,
  reviewDate: Date,
): ValidationResult => {
  if (reviewStatus === "Reviewed" || reviewStatus === "Requires follow-up") {
    const now = new Date();
    if (reviewDate > now) {
      return {
        isValid: false,
        message: "Review date cannot be in the future for completed reviews",
        code: "FUTURE_REVIEW_DATE",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates website accessibility (placeholder for future implementation)
 */
export const validateWebsiteAccessibility = async (website: string): Promise<ValidationResult> => {
  // This would be implemented to check if website is accessible
  // For now, just validate the URL format
  return validateWebsite(website);
};

/**
 * Validates that user exists (placeholder for database check)
 */
export const validateUserExists = async (userId: number): Promise<ValidationResult> => {
  // This would be implemented to check if user exists in database
  // For now, just validate the ID format
  return validateForeignKey(userId, "User ID", true);
};

/**
 * Complete validation for vendor creation with business rules
 */
export const validateCompleteVendorWithBusinessRules = (data: any): ValidationError[] => {
  const errors = validateCompleteVendor(data);

  // Add business rule validations if basic validation passes
  if (errors.length === 0) {
    // Check review date consistency
    if (data.review_status && data.review_date) {
      const reviewDateCheck = validateReviewDateConsistency(
        data.review_status,
        new Date(data.review_date),
      );

      if (!reviewDateCheck.isValid) {
        errors.push({
          field: "review_date",
          message: reviewDateCheck.message || "Review date is inconsistent",
          code: reviewDateCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
  }

  return errors;
};

/**
 * Complete validation for vendor updates with business rules
 */
export const validateUpdateVendorWithBusinessRules = (
  data: any,
  currentVendor?: any,
): ValidationError[] => {
  const errors = validateUpdateVendor(data);

  // Add business rule validations if basic validation passes
  if (errors.length === 0 && currentVendor) {
    // Check status progression if status is being updated
    if (data.review_status !== undefined) {
      const statusProgression = validateReviewStatusProgression(
        currentVendor.review_status,
        data.review_status,
      );

      if (!statusProgression.isValid) {
        errors.push({
          field: "review_status",
          message: statusProgression.message || "Invalid status progression",
          code: statusProgression.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }

    // Check review date consistency
    const newStatus =
      data.review_status !== undefined ? data.review_status : currentVendor.review_status;
    const newDate = data.review_date !== undefined ? data.review_date : currentVendor.review_date;

    if (newStatus && newDate) {
      const reviewDateCheck = validateReviewDateConsistency(newStatus, new Date(newDate));

      if (!reviewDateCheck.isValid) {
        errors.push({
          field: "review_date",
          message: reviewDateCheck.message || "Review date is inconsistent",
          code: reviewDateCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
  }

  return errors;
};
