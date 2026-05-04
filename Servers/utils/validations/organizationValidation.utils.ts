/**
 * Organization specific validation utilities
 * Contains validation schemas and functions specifically for organization operations
 */

import {
  validateString,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";
import {
  validateUserEmail,
  validateName,
  validateSurname,
  validateUserPassword,
} from "./userValidation.utils";

/**
 * Validation constants for organizations
 */
export const ORGANIZATION_VALIDATION_LIMITS = {
  NAME: { MIN: 2, MAX: 255 },
  LOGO: { MIN: 1, MAX: 500 },
} as const;

/**
 * Validates organization name field
 */
export const validateOrganizationName = (value: any): ValidationResult => {
  return validateString(value, "Organization name", {
    required: true,
    minLength: ORGANIZATION_VALIDATION_LIMITS.NAME.MIN,
    maxLength: ORGANIZATION_VALIDATION_LIMITS.NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates organization logo field
 */
export const validateOrganizationLogo = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Logo is optional
  }

  return validateString(value, "Organization logo", {
    required: false,
    minLength: ORGANIZATION_VALIDATION_LIMITS.LOGO.MIN,
    maxLength: ORGANIZATION_VALIDATION_LIMITS.LOGO.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates organization ID parameter
 */
export const validateOrganizationIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Organization ID", true);
};

/**
 * Validates user email field for organization creation
 * Uses the same validation as user registration
 */
export const validateOrgUserEmail = (value: any): ValidationResult => {
  return validateUserEmail(value);
};

/**
 * Validates user name field for organization creation
 * Uses the same validation as user registration
 */
export const validateOrgUserName = (value: any): ValidationResult => {
  return validateName(value);
};

/**
 * Validates user surname field for organization creation
 * Uses the same validation as user registration
 */
export const validateOrgUserSurname = (value: any): ValidationResult => {
  return validateSurname(value);
};

/**
 * Validates user password field for organization creation
 * Uses the same comprehensive validation as user registration including special characters
 */
export const validateOrgUserPassword = (value: any): ValidationResult => {
  return validateUserPassword(value);
};

/**
 * Validation schema for creating a new organization
 */
export const createOrganizationSchema = {
  name: validateOrganizationName,
  logo: validateOrganizationLogo,
  userEmail: validateOrgUserEmail,
  userName: validateOrgUserName,
  userSurname: validateOrgUserSurname,
  userPassword: validateOrgUserPassword,
};

/**
 * Validation schema for updating an organization
 * All fields are optional for updates
 */
export const updateOrganizationSchema = {
  name: (value: any) => (value !== undefined ? validateOrganizationName(value) : { isValid: true }),
  logo: (value: any) => (value !== undefined ? validateOrganizationLogo(value) : { isValid: true }),
};

/**
 * Validates a complete organization object for creation
 */
export const validateCompleteOrganization = (data: any): ValidationError[] => {
  return validateSchema(data, createOrganizationSchema);
};

/**
 * Validates an organization object for updates
 */
export const validateUpdateOrganization = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = ["name", "logo"];
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

  return validateSchema(data, updateOrganizationSchema);
};

/**
 * Business rule validation for organization creation
 */
export const validateOrganizationCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check for reserved organization names
  const reservedNames = ["admin", "system", "root", "api", "www", "mail", "ftp"];
  if (
    data.name &&
    reservedNames.some((reserved) => data.name.toLowerCase().includes(reserved.toLowerCase()))
  ) {
    errors.push({
      field: "name",
      message: "Organization name cannot contain reserved words",
      code: "RESERVED_NAME",
    });
  }

  // Check organization name doesn't start with special characters
  if (data.name && /^[^a-zA-Z]/.test(data.name)) {
    errors.push({
      field: "name",
      message: "Organization name must start with a letter",
      code: "INVALID_NAME_START",
    });
  }

  // Validate logo URL format if provided
  if (data.logo) {
    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*\.(jpg|jpeg|png|gif|svg|webp)(\?[^\s]*)?$/i;
    if (!urlPattern.test(data.logo)) {
      errors.push({
        field: "logo",
        message: "Logo must be a valid image URL (jpg, jpeg, png, gif, svg, webp)",
        code: "INVALID_LOGO_URL",
      });
    }
  }

  // Validate user email domain
  if (data.userEmail) {
    const emailDomain = data.userEmail.split("@")[1];
    if (emailDomain) {
      // Check for suspicious email domains
      const suspiciousDomains = ["example.com", "test.com", "temp.com", "fake.com"];
      if (suspiciousDomains.includes(emailDomain.toLowerCase())) {
        errors.push({
          field: "userEmail",
          message: "Please use a valid business email address",
          code: "SUSPICIOUS_EMAIL_DOMAIN",
        });
      }
    }
  }

  // Validate that user name and surname are different
  if (
    data.userName &&
    data.userSurname &&
    data.userName.toLowerCase() === data.userSurname.toLowerCase()
  ) {
    errors.push({
      field: "userSurname",
      message: "User name and surname cannot be the same",
      code: "IDENTICAL_NAME_SURNAME",
    });
  }

  // Check for common weak passwords (additional security on top of comprehensive validation)
  if (data.userPassword) {
    const weakPasswords = ["password", "12345678", "qwerty", "admin123", "password123"];
    if (weakPasswords.includes(data.userPassword.toLowerCase())) {
      errors.push({
        field: "userPassword",
        message: "Password is too common. Please choose a stronger password",
        code: "WEAK_PASSWORD",
      });
    }
  }

  return errors;
};

/**
 * Business rule validation for organization updates
 */
export const validateOrganizationUpdateBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Only validate name if it's being updated
  if (data.name !== undefined) {
    // Check for reserved organization names
    const reservedNames = ["admin", "system", "root", "api", "www", "mail", "ftp"];
    if (
      reservedNames.some((reserved) => data.name.toLowerCase().includes(reserved.toLowerCase()))
    ) {
      errors.push({
        field: "name",
        message: "Organization name cannot contain reserved words",
        code: "RESERVED_NAME",
      });
    }

    // Check organization name doesn't start with special characters
    if (/^[^a-zA-Z]/.test(data.name)) {
      errors.push({
        field: "name",
        message: "Organization name must start with a letter",
        code: "INVALID_NAME_START",
      });
    }
  }

  // Only validate logo if it's being updated
  if (data.logo !== undefined && data.logo !== null && data.logo !== "") {
    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*\.(jpg|jpeg|png|gif|svg|webp)(\?[^\s]*)?$/i;
    if (!urlPattern.test(data.logo)) {
      errors.push({
        field: "logo",
        message: "Logo must be a valid image URL (jpg, jpeg, png, gif, svg, webp)",
        code: "INVALID_LOGO_URL",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for organization creation with business rules
 */
export const validateCompleteOrganizationCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteOrganization(data);
  const businessErrors = validateOrganizationCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for organization updates with business rules
 */
export const validateCompleteOrganizationUpdate = (data: any): ValidationError[] => {
  const validationErrors = validateUpdateOrganization(data);
  const businessErrors = validateOrganizationUpdateBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};
