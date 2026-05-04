/**
 * Mail specific validation utilities
 * Contains validation schemas and functions specifically for email/mail operations
 */

import {
  validateString,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for mail operations
 */
export const MAIL_VALIDATION_LIMITS = {
  NAME: { MIN: 1, MAX: 100 },
  SURNAME: { MIN: 1, MAX: 100 },
  EMAIL_SUBJECT: { MIN: 1, MAX: 255 },
  EMAIL_BODY: { MIN: 1, MAX: 5000 },
} as const;

/**
 * Email validation pattern
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates email address field
 */
export const validateEmailField = (value: any): ValidationResult => {
  return validateString(value, "Email address", {
    required: true,
    pattern: EMAIL_PATTERN,
    trimWhitespace: true,
    maxLength: 254, // RFC 5321 limit
  });
};

/**
 * Validates recipient email address (to field)
 */
export const validateToField = (value: any): ValidationResult => {
  return validateString(value, "Recipient email", {
    required: true,
    pattern: EMAIL_PATTERN,
    trimWhitespace: true,
    maxLength: 254,
  });
};

/**
 * Validates sender/reference email address
 */
export const validateFromEmailField = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Optional field
  }

  return validateString(value, "Reference email", {
    required: false,
    pattern: EMAIL_PATTERN,
    trimWhitespace: true,
    maxLength: 254,
  });
};

/**
 * Validates name field
 */
export const validateNameField = (value: any): ValidationResult => {
  return validateString(value, "Name", {
    required: true,
    minLength: MAIL_VALIDATION_LIMITS.NAME.MIN,
    maxLength: MAIL_VALIDATION_LIMITS.NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates surname field (optional)
 */
export const validateSurnameField = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Surname is optional
  }

  return validateString(value, "Surname", {
    required: false,
    minLength: MAIL_VALIDATION_LIMITS.SURNAME.MIN,
    maxLength: MAIL_VALIDATION_LIMITS.SURNAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates role ID field
 */
export const validateRoleIdField = (value: any): ValidationResult => {
  return validateForeignKey(value, "Role ID", true);
};

/**
 * Validates organization ID field
 */
export const validateOrganizationIdField = (value: any): ValidationResult => {
  return validateForeignKey(value, "Organization ID", true);
};

/**
 * Validates email domain to prevent potential abuse
 */
export const validateEmailDomain = (email: string): ValidationResult => {
  if (!email || typeof email !== "string") {
    return {
      isValid: false,
      message: "Email is required for domain validation",
      code: "MISSING_EMAIL",
    };
  }

  const domainPart = email.split("@")[1];
  if (!domainPart) {
    return {
      isValid: false,
      message: "Invalid email format",
      code: "INVALID_EMAIL_FORMAT",
    };
  }

  // Check for common suspicious patterns
  const suspiciousPatterns = [
    /^temp/i,
    /^fake/i,
    /^test/i,
    /^spam/i,
    /^trash/i,
    /^junk/i,
    /\.tk$/i,
    /\.ml$/i,
    /\.ga$/i,
    /\.cf$/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(domainPart)) {
      return {
        isValid: false,
        message: "Email domain appears to be temporary or suspicious",
        code: "SUSPICIOUS_EMAIL_DOMAIN",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validation schema for invite email request
 */
export const inviteEmailSchema = {
  to: validateToField,
  name: validateNameField,
  surname: validateSurnameField,
  roleId: validateRoleIdField,
  organizationId: validateOrganizationIdField,
};

/**
 * Validation schema for password reset email request
 */
export const passwordResetEmailSchema = {
  to: validateToField,
  name: validateNameField,
  email: validateFromEmailField,
};

/**
 * Validates a complete invite email request
 */
export const validateInviteEmailRequest = (data: any): ValidationError[] => {
  return validateSchema(data, inviteEmailSchema);
};

/**
 * Validates a complete password reset email request
 */
export const validatePasswordResetEmailRequest = (data: any): ValidationError[] => {
  return validateSchema(data, passwordResetEmailSchema);
};

/**
 * Business rule validation for invite emails
 */
export const validateInviteEmailBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate email domain for invite requests
  if (data.to) {
    const domainValidation = validateEmailDomain(data.to);
    if (!domainValidation.isValid) {
      errors.push({
        field: "to",
        message: domainValidation.message || "Invalid email domain",
        code: domainValidation.code || "BUSINESS_RULE_VIOLATION",
      });
    }
  }

  // Check that recipient email and reference email are different (if both provided)
  if (data.to && data.email && data.to.toLowerCase() === data.email.toLowerCase()) {
    errors.push({
      field: "email",
      message: "Reference email cannot be the same as recipient email",
      code: "DUPLICATE_EMAIL",
    });
  }

  // Validate role ID is within expected range (assuming roles 1-10 are valid)
  if (data.roleId && (data.roleId < 1 || data.roleId > 10)) {
    errors.push({
      field: "roleId",
      message: "Role ID must be between 1 and 10",
      code: "INVALID_ROLE_RANGE",
    });
  }

  // Validate organization ID is positive
  if (data.organizationId && data.organizationId < 1) {
    errors.push({
      field: "organizationId",
      message: "Organization ID must be a positive number",
      code: "INVALID_ORGANIZATION_ID",
    });
  }

  return errors;
};

/**
 * Business rule validation for password reset emails
 */
export const validatePasswordResetEmailBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate email domain for reset requests
  if (data.to) {
    const domainValidation = validateEmailDomain(data.to);
    if (!domainValidation.isValid) {
      errors.push({
        field: "to",
        message: domainValidation.message || "Invalid email domain",
        code: domainValidation.code || "BUSINESS_RULE_VIOLATION",
      });
    }
  }

  // Check that recipient email and reference email match (if both provided)
  if (data.to && data.email && data.to.toLowerCase() !== data.email.toLowerCase()) {
    errors.push({
      field: "email",
      message: "Reference email must match recipient email for password reset",
      code: "EMAIL_MISMATCH",
    });
  }

  return errors;
};

/**
 * Complete validation for invite email with business rules
 */
export const validateCompleteInviteEmail = (data: any): ValidationError[] => {
  const validationErrors = validateInviteEmailRequest(data);
  const businessErrors = validateInviteEmailBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for password reset email with business rules
 */
export const validateCompletePasswordResetEmail = (data: any): ValidationError[] => {
  const validationErrors = validatePasswordResetEmailRequest(data);
  const businessErrors = validatePasswordResetEmailBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Rate limiting validation (basic check)
 */
export const validateEmailRateLimit = (
  recipient: string,
  recentRequests: Map<string, number[]>,
  maxRequestsPerHour: number = 5,
): ValidationResult => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  const userRequests = recentRequests.get(recipient) || [];
  const recentUserRequests = userRequests.filter((timestamp) => timestamp > oneHourAgo);

  if (recentUserRequests.length >= maxRequestsPerHour) {
    return {
      isValid: false,
      message: `Rate limit exceeded. Maximum ${maxRequestsPerHour} emails per hour allowed`,
      code: "RATE_LIMIT_EXCEEDED",
    };
  }

  // Update the requests map
  recentRequests.set(recipient, [...recentUserRequests, now]);

  return { isValid: true };
};
