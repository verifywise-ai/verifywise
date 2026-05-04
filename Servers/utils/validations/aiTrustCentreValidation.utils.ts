/**
 * AI Trust Centre specific validation utilities
 * Contains validation schemas and functions specifically for AI Trust Centre operations
 */

import { IAITrustCentreOverview } from "../../domain.layer/interfaces/i.aiTrustCentreOverview";
import { IAITrustCentreResources } from "../../domain.layer/interfaces/i.aiTrustCentreResources";
import { IAITrustCentreSubprocessors } from "../../domain.layer/interfaces/i.aiTrustCentreSubprocessors";
import {
  validateString,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for AI Trust Centre
 */
export const AI_TRUST_CENTRE_VALIDATION_LIMITS = {
  TITLE: { MIN: 3, MAX: 255 },
  HEADER_COLOR: { MIN: 3, MAX: 20 },
  PURPOSE_TEXT: { MIN: 10, MAX: 10000 },
  STATEMENT_TEXT: { MIN: 10, MAX: 10000 },
  MISSION_TEXT: { MIN: 10, MAX: 10000 },
  BACKGROUND_TEXT: { MIN: 10, MAX: 10000 },
  CORE_BENEFITS_TEXT: { MIN: 10, MAX: 10000 },
  COMPLIANCE_DOC_TEXT: { MIN: 10, MAX: 10000 },
  TERMS_TEXT: { MIN: 10, MAX: 10000 },
  PRIVACY_TEXT: { MIN: 10, MAX: 10000 },
  EMAIL_TEXT: { MIN: 3, MAX: 255 },
  RESOURCE_NAME: { MIN: 3, MAX: 255 },
  RESOURCE_DESCRIPTION: { MIN: 10, MAX: 2000 },
  SUBPROCESSOR_NAME: { MIN: 3, MAX: 255 },
  SUBPROCESSOR_PURPOSE: { MIN: 10, MAX: 2000 },
  SUBPROCESSOR_LOCATION: { MIN: 3, MAX: 255 },
  HASH: { EXACT: 64 },
} as const;

/**
 * Validates AI Trust Centre ID parameter
 */
export const validateAITrustCentreIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "AI Trust Centre ID", true);
};

/**
 * Validates overview info section
 */
export const validateOverviewInfo = (value: any): ValidationResult => {
  if (!value || typeof value !== "object") {
    return {
      isValid: false,
      message: "Overview info must be an object",
      code: "INVALID_INFO_TYPE",
    };
  }

  // Validate title (optional)
  if (value.title !== undefined && value.title !== null && value.title !== "") {
    const titleValidation = validateString(value.title, "Title", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.TITLE.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.TITLE.MAX,
      trimWhitespace: true,
    });
    if (!titleValidation.isValid) {
      return titleValidation;
    }
  }

  // Validate header color (optional)
  if (
    value.header_color !== undefined &&
    value.header_color !== null &&
    value.header_color !== ""
  ) {
    const colorValidation = validateString(value.header_color, "Header color", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.HEADER_COLOR.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.HEADER_COLOR.MAX,
      trimWhitespace: true,
    });
    if (!colorValidation.isValid) {
      return colorValidation;
    }

    // Check if it's a valid color format (hex, rgb, or named color)
    const colorPattern = /^(#[0-9A-Fa-f]{3,8}|rgb\(.*\)|rgba\(.*\)|[a-zA-Z]+)$/;
    if (!colorPattern.test(value.header_color.trim())) {
      return {
        isValid: false,
        message: "Header color must be a valid color format (hex, rgb, or named color)",
        code: "INVALID_COLOR_FORMAT",
      };
    }
  }

  // Validate logo file ID if provided (optional)
  if (value.logo !== undefined && value.logo !== null && value.logo !== "") {
    const logoValidation = validateForeignKey(value.logo, "Logo file ID", false);
    if (!logoValidation.isValid) {
      return logoValidation;
    }
  }

  return { isValid: true };
};

/**
 * Validates overview intro section
 * Only validates text fields if they are visible and have content
 */
export const validateOverviewIntro = (value: any): ValidationResult => {
  if (!value || typeof value !== "object") {
    return {
      isValid: false,
      message: "Overview intro must be an object",
      code: "INVALID_INTRO_TYPE",
    };
  }

  // Only validate purpose text if it's visible and has content
  if (
    value.purpose_visible &&
    value.purpose_text !== undefined &&
    value.purpose_text !== null &&
    value.purpose_text !== ""
  ) {
    const purposeValidation = validateString(value.purpose_text, "Purpose text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.PURPOSE_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.PURPOSE_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!purposeValidation.isValid) {
      return purposeValidation;
    }
  }

  // Only validate statement text if it's visible and has content
  if (
    value.our_statement_visible &&
    value.our_statement_text !== undefined &&
    value.our_statement_text !== null &&
    value.our_statement_text !== ""
  ) {
    const statementValidation = validateString(value.our_statement_text, "Our statement text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.STATEMENT_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.STATEMENT_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!statementValidation.isValid) {
      return statementValidation;
    }
  }

  // Only validate mission text if it's visible and has content
  if (
    value.our_mission_visible &&
    value.our_mission_text !== undefined &&
    value.our_mission_text !== null &&
    value.our_mission_text !== ""
  ) {
    const missionValidation = validateString(value.our_mission_text, "Our mission text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.MISSION_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.MISSION_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!missionValidation.isValid) {
      return missionValidation;
    }
  }

  return { isValid: true };
};

/**
 * Validates overview company description section
 * Only validates text fields if they are visible and have content
 */
export const validateOverviewCompanyDescription = (value: any): ValidationResult => {
  if (!value || typeof value !== "object") {
    return {
      isValid: false,
      message: "Company description must be an object",
      code: "INVALID_COMPANY_DESCRIPTION_TYPE",
    };
  }

  // Only validate background text if it's visible and has content
  if (
    value.background_visible &&
    value.background_text !== undefined &&
    value.background_text !== null &&
    value.background_text !== ""
  ) {
    const backgroundValidation = validateString(value.background_text, "Background text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.BACKGROUND_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.BACKGROUND_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!backgroundValidation.isValid) {
      return backgroundValidation;
    }
  }

  // Only validate core benefits text if it's visible and has content
  if (
    value.core_benefits_visible &&
    value.core_benefits_text !== undefined &&
    value.core_benefits_text !== null &&
    value.core_benefits_text !== ""
  ) {
    const benefitsValidation = validateString(value.core_benefits_text, "Core benefits text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.CORE_BENEFITS_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.CORE_BENEFITS_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!benefitsValidation.isValid) {
      return benefitsValidation;
    }
  }

  // Only validate compliance doc text if it's visible and has content
  if (
    value.compliance_doc_visible &&
    value.compliance_doc_text !== undefined &&
    value.compliance_doc_text !== null &&
    value.compliance_doc_text !== ""
  ) {
    const complianceValidation = validateString(
      value.compliance_doc_text,
      "Compliance document text",
      {
        required: false,
        minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.COMPLIANCE_DOC_TEXT.MIN,
        maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.COMPLIANCE_DOC_TEXT.MAX,
        trimWhitespace: true,
      },
    );
    if (!complianceValidation.isValid) {
      return complianceValidation;
    }
  }

  return { isValid: true };
};

/**
 * Validates overview terms and contact section
 * Only validates text fields if they are visible and have content
 */
export const validateOverviewTermsAndContact = (value: any): ValidationResult => {
  if (!value || typeof value !== "object") {
    return {
      isValid: false,
      message: "Terms and contact must be an object",
      code: "INVALID_TERMS_CONTACT_TYPE",
    };
  }

  // Only validate terms text if it's visible and has content
  if (
    value.terms_visible &&
    value.terms_text !== undefined &&
    value.terms_text !== null &&
    value.terms_text !== ""
  ) {
    const termsValidation = validateString(value.terms_text, "Terms text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.TERMS_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.TERMS_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!termsValidation.isValid) {
      return termsValidation;
    }
  }

  // Only validate privacy text if it's visible and has content
  if (
    value.privacy_visible &&
    value.privacy_text !== undefined &&
    value.privacy_text !== null &&
    value.privacy_text !== ""
  ) {
    const privacyValidation = validateString(value.privacy_text, "Privacy text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.PRIVACY_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.PRIVACY_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!privacyValidation.isValid) {
      return privacyValidation;
    }
  }

  // Only validate email text if it's visible and has content
  if (
    value.email_visible &&
    value.email_text !== undefined &&
    value.email_text !== null &&
    value.email_text !== ""
  ) {
    const emailValidation = validateString(value.email_text, "Email text", {
      required: false,
      minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.EMAIL_TEXT.MIN,
      maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.EMAIL_TEXT.MAX,
      trimWhitespace: true,
    });
    if (!emailValidation.isValid) {
      return emailValidation;
    }

    // Basic email format validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value.email_text.trim())) {
      return {
        isValid: false,
        message: "Email text must be a valid email address",
        code: "INVALID_EMAIL_FORMAT",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates resource name field
 */
export const validateResourceName = (value: any): ValidationResult => {
  return validateString(value, "Resource name", {
    required: true,
    minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.RESOURCE_NAME.MIN,
    maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.RESOURCE_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates resource description field
 */
export const validateResourceDescription = (value: any): ValidationResult => {
  return validateString(value, "Resource description", {
    required: true,
    minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.RESOURCE_DESCRIPTION.MIN,
    maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.RESOURCE_DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates resource file ID field
 */
export const validateResourceFileId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Resource file ID", true);
};

/**
 * Validates subprocessor name field
 */
export const validateSubprocessorName = (value: any): ValidationResult => {
  return validateString(value, "Subprocessor name", {
    required: true,
    minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.SUBPROCESSOR_NAME.MIN,
    maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.SUBPROCESSOR_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates subprocessor purpose field
 */
export const validateSubprocessorPurpose = (value: any): ValidationResult => {
  return validateString(value, "Subprocessor purpose", {
    required: true,
    minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.SUBPROCESSOR_PURPOSE.MIN,
    maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.SUBPROCESSOR_PURPOSE.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates subprocessor location field
 */
export const validateSubprocessorLocation = (value: any): ValidationResult => {
  return validateString(value, "Subprocessor location", {
    required: true,
    minLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.SUBPROCESSOR_LOCATION.MIN,
    maxLength: AI_TRUST_CENTRE_VALIDATION_LIMITS.SUBPROCESSOR_LOCATION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates subprocessor URL field
 */
export const validateSubprocessorURL = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // URL is optional
  }

  if (typeof value !== "string") {
    return {
      isValid: false,
      message: "Subprocessor URL must be a string",
      code: "INVALID_URL_TYPE",
    };
  }

  const trimmedValue = value.trim();

  // Basic URL validation
  try {
    new URL(trimmedValue);
    return { isValid: true };
  } catch {
    return {
      isValid: false,
      message: "Subprocessor URL must be a valid URL",
      code: "INVALID_URL_FORMAT",
    };
  }
};

/**
 * Validation schema for creating AI Trust Centre resource
 */
export const createResourceSchema = {
  name: validateResourceName,
  description: validateResourceDescription,
};

/**
 * Validation schema for updating AI Trust Centre resource
 */
export const updateResourceSchema = {
  name: (value: any) => (value !== undefined ? validateResourceName(value) : { isValid: true }),
  description: (value: any) =>
    value !== undefined ? validateResourceDescription(value) : { isValid: true },
};

/**
 * Validation schema for creating AI Trust Centre subprocessor
 */
export const createSubprocessorSchema = {
  name: validateSubprocessorName,
  purpose: validateSubprocessorPurpose,
  location: validateSubprocessorLocation,
  url: validateSubprocessorURL,
};

/**
 * Validation schema for updating AI Trust Centre subprocessor
 */
export const updateSubprocessorSchema = {
  name: (value: any) => (value !== undefined ? validateSubprocessorName(value) : { isValid: true }),
  purpose: (value: any) =>
    value !== undefined ? validateSubprocessorPurpose(value) : { isValid: true },
  location: (value: any) =>
    value !== undefined ? validateSubprocessorLocation(value) : { isValid: true },
  url: (value: any) => (value !== undefined ? validateSubprocessorURL(value) : { isValid: true }),
};

/**
 * Validates file upload for AI Trust Centre
 */
export const validateAITrustCentreFileUpload = (
  file: any,
  type: "logo" | "resource",
): ValidationResult => {
  if (!file) {
    return {
      isValid: false,
      message: "File is required",
      code: "FILE_REQUIRED",
    };
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return {
      isValid: false,
      message: "File size cannot exceed 10MB",
      code: "FILE_TOO_LARGE",
    };
  }

  // Validate file type based on upload type
  if (type === "logo") {
    const allowedImageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/svg+xml",
    ];
    if (!allowedImageTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        message: "Logo must be an image file (JPEG, PNG, GIF, or SVG)",
        code: "INVALID_LOGO_TYPE",
      };
    }
  } else if (type === "resource") {
    // For resources, allow common document and image types
    const allowedResourceTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
    ];
    if (!allowedResourceTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        message: "Resource must be a PDF, Word document, text file, or image",
        code: "INVALID_RESOURCE_TYPE",
      };
    }
  }

  return { isValid: true };
};

/**
 * Business rule validation for AI Trust Centre overview
 * Only validates content when the section is actually visible
 */
export const validateOverviewBusinessRules = (
  data: Partial<IAITrustCentreOverview>,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Only validate intro content if intro section is visible in info
  if (data.info?.intro_visible && data.intro) {
    if (
      data.intro.purpose_visible &&
      (!data.intro.purpose_text || data.intro.purpose_text.trim().length < 10)
    ) {
      errors.push({
        field: "intro.purpose_text",
        message: "Purpose text is required when purpose section is visible",
        code: "MISSING_PURPOSE_CONTENT",
      });
    }

    if (
      data.intro.our_statement_visible &&
      (!data.intro.our_statement_text || data.intro.our_statement_text.trim().length < 10)
    ) {
      errors.push({
        field: "intro.our_statement_text",
        message: "Statement text is required when statement section is visible",
        code: "MISSING_STATEMENT_CONTENT",
      });
    }

    if (
      data.intro.our_mission_visible &&
      (!data.intro.our_mission_text || data.intro.our_mission_text.trim().length < 10)
    ) {
      errors.push({
        field: "intro.our_mission_text",
        message: "Mission text is required when mission section is visible",
        code: "MISSING_MISSION_CONTENT",
      });
    }
  }

  // Only validate company description content if company_description section is visible in info
  if (data.info?.company_description_visible && data.company_description) {
    if (
      data.company_description.background_visible &&
      (!data.company_description.background_text ||
        data.company_description.background_text.trim().length < 10)
    ) {
      errors.push({
        field: "company_description.background_text",
        message: "Background text is required when background section is visible",
        code: "MISSING_BACKGROUND_CONTENT",
      });
    }

    if (
      data.company_description.core_benefits_visible &&
      (!data.company_description.core_benefits_text ||
        data.company_description.core_benefits_text.trim().length < 10)
    ) {
      errors.push({
        field: "company_description.core_benefits_text",
        message: "Core benefits text is required when core benefits section is visible",
        code: "MISSING_BENEFITS_CONTENT",
      });
    }
  }

  // Only validate terms and contact content if terms_and_contact section is visible in info
  if (data.info?.terms_and_contact_visible && data.terms_and_contact) {
    if (
      data.terms_and_contact.email_visible &&
      (!data.terms_and_contact.email_text || data.terms_and_contact.email_text.trim().length < 3)
    ) {
      errors.push({
        field: "terms_and_contact.email_text",
        message: "Email is required when email section is visible",
        code: "MISSING_EMAIL_CONTENT",
      });
    }
  }

  return errors;
};

// **

/**
 * Complete validation for AI Trust Centre resource creation with business rules
 */
export const validateResourceCreate = (
  data: Partial<IAITrustCentreResources>,
): ValidationError[] => {
  const validationErrors = validateSchema(data, createResourceSchema);
  return validationErrors;
};

/**
 * Complete validation for AI Trust Centre resource updates with business rules
 */
export const validateResourceUpdate = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = ["name", "description", "visible"];
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

  return validateSchema(data, updateResourceSchema);
};

/**
 * Complete validation for AI Trust Centre subprocessor updates with business rules
 */
export const validateSubprocessorUpdate = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = ["name", "purpose", "location", "url"];
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

  return validateSchema(data, updateSubprocessorSchema);
};

/**
 * Complete validation for AI Trust Centre subprocessor creation with business rules
 */
export const validateSubprocessorCreate = (
  data: Partial<IAITrustCentreSubprocessors>,
): ValidationError[] => {
  const validationErrors = validateSchema(data, createSubprocessorSchema);
  // Add any subprocessor-specific business rules here if needed
  return validationErrors;
};

/**
 * Complete validation for AI Trust Centre overview update
 */
export const validateOverviewUpdate = (
  data: Partial<IAITrustCentreOverview>,
): ValidationError[] => {
  const validationErrors: ValidationError[] = [];
  const businessErrors = validateOverviewBusinessRules(data);

  // Validate individual sections if provided
  if (data.info !== undefined) {
    const infoValidation = validateOverviewInfo(data.info);
    if (!infoValidation.isValid) {
      validationErrors.push({
        field: "info",
        message: infoValidation.message || "Invalid info section",
        code: infoValidation.code || "INVALID_INFO",
      });
    }
  }

  if (data.intro !== undefined) {
    const introValidation = validateOverviewIntro(data.intro);
    if (!introValidation.isValid) {
      validationErrors.push({
        field: "intro",
        message: introValidation.message || "Invalid intro section",
        code: introValidation.code || "INVALID_INTRO",
      });
    }
  }

  if (data.company_description !== undefined) {
    const companyValidation = validateOverviewCompanyDescription(data.company_description);
    if (!companyValidation.isValid) {
      validationErrors.push({
        field: "company_description",
        message: companyValidation.message || "Invalid company description section",
        code: companyValidation.code || "INVALID_COMPANY_DESCRIPTION",
      });
    }
  }

  if (data.terms_and_contact !== undefined) {
    const termsValidation = validateOverviewTermsAndContact(data.terms_and_contact);
    if (!termsValidation.isValid) {
      validationErrors.push({
        field: "terms_and_contact",
        message: termsValidation.message || "Invalid terms and contact section",
        code: termsValidation.code || "INVALID_TERMS_CONTACT",
      });
    }
  }

  return [...validationErrors, ...businessErrors];
};
