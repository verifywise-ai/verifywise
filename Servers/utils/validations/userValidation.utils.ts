/**
 * User specific validation utilities
 * Contains validation schemas and functions specifically for user operations
 */

import {
  validateString,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Email validation using regex pattern
 */
const validateEmail = (
  value: any,
  fieldName: string,
  options: {
    required?: boolean;
    maxLength?: number;
    trimWhitespace?: boolean;
  } = {}
): ValidationResult => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const { required = false, maxLength = 128, trimWhitespace = true } = options;

  // First validate as string
  const stringValidation = validateString(value, fieldName, {
    required,
    maxLength,
    trimWhitespace,
    minLength: required ? 1 : 0,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // If value is provided, validate email format
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    const emailValue = trimWhitespace ? String(value).trim() : String(value);
    if (!emailRegex.test(emailValue)) {
      return {
        isValid: false,
        message: `${fieldName} must be a valid email address`,
        code: "INVALID_EMAIL_FORMAT",
      };
    }
  }

  return { isValid: true };
};

/**
 * Password validation with complexity requirements
 */
const validatePassword = (
  value: any,
  fieldName: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumber?: boolean;
    requireSpecialChar?: boolean;
  } = {}
): ValidationResult => {
  const {
    required = false,
    minLength = 8,
    maxLength = 20,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecialChar = false,
  } = options;

  // First validate as string (don't trim passwords)
  const stringValidation = validateString(value, fieldName, {
    required,
    minLength,
    maxLength,
    trimWhitespace: false,
    allowEmpty: !required,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // If password is provided, validate complexity
  if (value !== undefined && value !== null && String(value) !== "") {
    const password = String(value);
    const errors = [];

    if (requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("at least one uppercase letter (A-Z)");
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
      errors.push("at least one lowercase letter (a-z)");
    }

    if (requireNumber && !/\d/.test(password)) {
      errors.push("at least one number (0-9)");
    }

    if (requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('at least one special character (!@#$%^&*(),.?":{}|<>)');
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        message: `${fieldName} must contain ${errors.join(", ")}`,
        code: "PASSWORD_COMPLEXITY_FAILED",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validation constants for users
 */
export const USER_VALIDATION_LIMITS = {
  NAME: { MIN: 2, MAX: 50 },
  SURNAME: { MIN: 2, MAX: 50 },
  EMAIL: { MIN: 1, MAX: 128 },
  PASSWORD: { MIN: 8, MAX: 32 },
  ROLE_ID: { MIN: 1 },
  ORGANIZATION_ID: { MIN: 1 },
} as const;

/**
 * User validation enums
 */
export const USER_VALIDATION_ENUMS = {
  DEMO_USER: [true, false] as const,
} as const;

/**
 * Validates name field
 */
export const validateName = (value: any): ValidationResult => {
  return validateString(value, "Name", {
    required: true,
    minLength: USER_VALIDATION_LIMITS.NAME.MIN,
    maxLength: USER_VALIDATION_LIMITS.NAME.MAX,
    trimWhitespace: true,
    allowEmpty: false,
  });
};

/**
 * Validates surname field
 */
export const validateSurname = (value: any): ValidationResult => {
  return validateString(value, "Surname", {
    required: true,
    minLength: USER_VALIDATION_LIMITS.SURNAME.MIN,
    maxLength: USER_VALIDATION_LIMITS.SURNAME.MAX,
    trimWhitespace: true,
    allowEmpty: false,
  });
};

/**
 * Validates email field with enhanced validation
 */
export const validateUserEmail = (value: any): ValidationResult => {
  return validateEmail(value, "Email", {
    required: true,
    maxLength: USER_VALIDATION_LIMITS.EMAIL.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates password field with complexity requirements
 */
export const validateUserPassword = (value: any): ValidationResult => {
  return validatePassword(value, "Password", {
    required: true,
    minLength: USER_VALIDATION_LIMITS.PASSWORD.MIN,
    maxLength: USER_VALIDATION_LIMITS.PASSWORD.MAX,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecialChar: true,
  });
};

/**
 * Validates password confirmation field
 */
export const validatePasswordConfirmation = (
  password: any,
  confirmPassword: any
): ValidationResult => {
  if (!confirmPassword) {
    return {
      isValid: false,
      message: "Password confirmation is required",
      code: "REQUIRED",
    };
  }

  if (password !== confirmPassword) {
    return {
      isValid: false,
      message:
        "Passwords do not match. Please ensure both fields are identical.",
      code: "PASSWORD_MISMATCH",
    };
  }

  return { isValid: true };
};

/**
 * Validates role ID field
 */
export const validateRoleId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Role ID", true);
};

/**
 * Validates organization ID field
 */
export const validateOrganizationId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Organization ID", true);
};

/**
 * Validates user ID for existing records
 */
export const validateUserId = (value: any): ValidationResult => {
  return validateForeignKey(value, "User ID", true);
};

/**
 * Validates current password for password change operations
 */
export const validateCurrentPassword = (value: any): ValidationResult => {
  return validateString(value, "Current password", {
    required: true,
    minLength: 1,
    trimWhitespace: false, // Don't trim passwords
  });
};

/**
 * Validates last login timestamp
 */
export const validateLastLogin = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      message: "Last login must be a valid date",
      code: "INVALID_DATE",
    };
  }

  return { isValid: true };
};

/**
 * Validates is_demo field
 */
export const validateIsDemo = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field, defaults to false
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
 * Validation schema for creating a new user (registration)
 */
export const createUserSchema = {
  name: validateName,
  surname: validateSurname,
  email: validateUserEmail,
  password: validateUserPassword,
  roleId: validateRoleId,
  organizationId: validateOrganizationId,
};

/**
 * Validation schema for user login
 */
export const loginUserSchema = {
  email: validateUserEmail,
  password: (value: any) =>
    validateString(value, "Password", {
      required: true,
      minLength: 1,
      trimWhitespace: false,
    }),
};

/**
 * Validation schema for updating a user
 * All fields are optional for updates
 */
export const updateUserSchema = {
  name: (value: any) =>
    value !== undefined ? validateName(value) : { isValid: true },
  surname: (value: any) =>
    value !== undefined ? validateSurname(value) : { isValid: true },
  email: (value: any) =>
    value !== undefined ? validateUserEmail(value) : { isValid: true },
  roleId: (value: any) =>
    value !== undefined ? validateRoleId(value) : { isValid: true },
  last_login: (value: any) =>
    value !== undefined ? validateLastLogin(value) : { isValid: true },
};

/**
 * Validation schema for password reset
 */
export const resetPasswordSchema = {
  email: validateUserEmail,
  newPassword: validateUserPassword,
};

/**
 * Validation schema for password change
 */
export const changePasswordSchema = {
  id: validateUserId,
  currentPassword: validateCurrentPassword,
  newPassword: validateUserPassword,
};

/**
 * Validation schema for role update
 */
export const updateRoleSchema = {
  newRoleId: validateRoleId,
};

/**
 * Validates a complete user object for creation
 */
export const validateCreateUser = (data: any): ValidationError[] => {
  const errors = validateSchema(data, createUserSchema);

  // Add password confirmation validation if provided
  if (data.confirmPassword !== undefined) {
    const confirmResult = validatePasswordConfirmation(
      data.password,
      data.confirmPassword
    );
    if (!confirmResult.isValid) {
      errors.push({
        field: "confirmPassword",
        message:
          confirmResult.message || "Password confirmation validation failed",
        code: confirmResult.code || "VALIDATION_FAILED",
      });
    }
  }

  return errors;
};

/**
 * Validates a user object for login
 */
export const validateLoginUser = (data: any): ValidationError[] => {
  return validateSchema(data, loginUserSchema);
};

/**
 * Validates a user object for updates
 */
export const validateUpdateUser = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = ["name", "surname", "email", "roleId", "last_login"];
  const hasUpdateField = updateFields.some(
    (field) => data[field] !== undefined
  );

  if (!hasUpdateField) {
    return [
      {
        field: "body",
        message: "At least one field must be provided for update",
        code: "NO_UPDATE_FIELDS",
      },
    ];
  }

  return validateSchema(data, updateUserSchema);
};

/**
 * Validates password reset data
 */
export const validateResetPassword = (data: any): ValidationError[] => {
  const errors = validateSchema(data, resetPasswordSchema);

  // Add password confirmation validation if provided
  if (data.confirmPassword !== undefined) {
    const confirmResult = validatePasswordConfirmation(
      data.newPassword,
      data.confirmPassword
    );
    if (!confirmResult.isValid) {
      errors.push({
        field: "confirmPassword",
        message:
          confirmResult.message || "Password confirmation validation failed",
        code: confirmResult.code || "VALIDATION_FAILED",
      });
    }
  }

  return errors;
};

/**
 * Validates password change data
 */
export const validateChangePassword = (data: any): ValidationError[] => {
  const errors = validateSchema(data, changePasswordSchema);

  // Add password confirmation validation if provided
  if (data.confirmPassword !== undefined) {
    const confirmResult = validatePasswordConfirmation(
      data.newPassword,
      data.confirmPassword
    );
    if (!confirmResult.isValid) {
      errors.push({
        field: "confirmPassword",
        message:
          confirmResult.message || "Password confirmation validation failed",
        code: confirmResult.code || "VALIDATION_FAILED",
      });
    }
  }

  return errors;
};

/**
 * Validates role update data
 */
export const validateUpdateRole = (data: any): ValidationError[] => {
  return validateSchema(data, updateRoleSchema);
};

/**
 * Validates user ID parameter
 */
export const validateUserIdParam = (id: any): ValidationResult => {
  return validateUserId(id);
};

/**
 * Validates email parameter
 */
export const validateEmailParam = (email: any): ValidationResult => {
  return validateUserEmail(email);
};

/**
 * Business logic validations
 */

/**
 * Validates that a user can be updated by the current user
 */
export const validateUserUpdatePermission = (
  targetUserId: number,
  currentUserId: number,
  currentUserRoleId: number
): ValidationResult => {
  // Admin can update anyone, regular users can only update themselves
  const isAdmin = currentUserRoleId === 1;
  const isSelfUpdate = targetUserId === currentUserId;

  if (!isAdmin && !isSelfUpdate) {
    return {
      isValid: false,
      message:
        "You can only update your own profile or be an admin to update other users",
      code: "INSUFFICIENT_PERMISSIONS",
    };
  }

  return { isValid: true };
};

/**
 * Validates that a user can be deleted by the current user
 */
export const validateUserDeletePermission = (
  targetUserId: number,
  currentUserId: number,
  currentUserRoleId: number,
  targetUserIsDemo: boolean = false
): ValidationResult => {
  // Only admins can delete users
  if (currentUserRoleId !== 1) {
    return {
      isValid: false,
      message: "Only administrators can delete users",
      code: "INSUFFICIENT_PERMISSIONS",
    };
  }

  // Cannot delete demo users
  if (targetUserIsDemo) {
    return {
      isValid: false,
      message: "Demo users cannot be deleted",
      code: "DEMO_USER_RESTRICTION",
    };
  }

  // Users cannot delete themselves
  if (targetUserId === currentUserId) {
    return {
      isValid: false,
      message: "You cannot delete your own account",
      code: "SELF_DELETION_RESTRICTION",
    };
  }

  return { isValid: true };
};

/**
 * Validates role update permissions
 */
export const validateRoleUpdatePermission = (
  targetUserId: number,
  currentUserId: number,
  currentUserRoleId: number,
  newRoleId: number,
  targetUserIsDemo: boolean = false
): ValidationResult => {
  // Only admins can update roles
  if (currentUserRoleId !== 1) {
    return {
      isValid: false,
      message: "Only administrators can update user roles",
      code: "INSUFFICIENT_PERMISSIONS",
    };
  }

  // Demo users cannot be assigned admin roles
  if (targetUserIsDemo && newRoleId === 1) {
    return {
      isValid: false,
      message: "Demo users cannot be assigned admin roles",
      code: "DEMO_USER_RESTRICTION",
    };
  }

  // Admins cannot demote themselves
  if (
    targetUserId === currentUserId &&
    currentUserRoleId === 1 &&
    newRoleId !== 1
  ) {
    return {
      isValid: false,
      message: "Administrators cannot demote themselves from admin role",
      code: "SELF_DEMOTION_RESTRICTION",
    };
  }

  return { isValid: true };
};

/**
 * Validates that user exists (placeholder for database check)
 * In real implementation, this would query the database
 */
export const validateUserExists = async (
  userId: number
): Promise<ValidationResult> => {
  // This would be implemented to check if user exists in database
  // For now, just validate the ID format
  return validateUserId(userId);
};

/**
 * Validates that email is unique (placeholder for database check)
 * In real implementation, this would query the database
 */
export const validateEmailUniqueness = async (
  email: string,
  _excludeUserId?: number
): Promise<ValidationResult> => {
  // This would be implemented to check email uniqueness in database
  // For now, just validate the email format
  return validateUserEmail(email);
};

/**
 * Validates that role exists (placeholder for database check)
 * In real implementation, this would query the database
 */
export const validateRoleExists = async (
  roleId: number
): Promise<ValidationResult> => {
  // This would be implemented to check if role exists in database
  // For now, just validate the ID format
  return validateRoleId(roleId);
};

/**
 * Validates that organization exists (placeholder for database check)
 * In real implementation, this would query the database
 */
export const validateOrganizationExists = async (
  organizationId: number
): Promise<ValidationResult> => {
  // This would be implemented to check if organization exists in database
  // For now, just validate the ID format
  return validateOrganizationId(organizationId);
};

/**
 * Complete validation for user creation with business rules
 */
export const validateCompleteUser = (data: any): ValidationError[] => {
  const errors = validateCreateUser(data);

  // Additional business rule validations can be added here
  // For example, checking against banned email domains, etc.

  return errors;
};

/**
 * Complete validation for user update with business rules
 */
export const validateCompleteUserUpdate = (
  data: any,
  targetUserId: number,
  currentUserId: number,
  currentUserRoleId: number
): ValidationError[] => {
  const errors = validateUpdateUser(data);

  // Add permission validation
  if (errors.length === 0) {
    const permissionResult = validateUserUpdatePermission(
      targetUserId,
      currentUserId,
      currentUserRoleId
    );

    if (!permissionResult.isValid) {
      errors.push({
        field: "permissions",
        message: permissionResult.message || "Permission validation failed",
        code: permissionResult.code || "PERMISSION_DENIED",
      });
    }
  }

  return errors;
};
