import { checkStringValidation } from "./stringValidation";

// Constants
const PASSWORD_REGEX = /[!@#$%^&*(),.?":{}|<>]/;
// Validation constants
export const VALIDATION_RULES = {
  NAME: { min: 2, max: 50 },
  PASSWORD: { min: 8, max: 32 },
  EMAIL: { min: 0, max: 128 },
  ORGANIZATION_NAME: { min: 2, max: 50 },
} as const;

// Define the shape of form values
export interface FormValues {
  name: string;
  surname: string;
  email: string;
  password: string;
  confirmPassword: string;
  roleId?: number;  // Optional role property
  organizationId?: number; // Optional organization property
}

// Define the shape of organization form values for multi-tenant
export interface OrganizationFormValues {
  organizationName: string;
}

// Define the shape of form errors
export interface FormErrors {
  name?: string;
  surname?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

// Define the shape of organization form errors
export interface OrganizationFormErrors {
  organizationName?: string;
  organizationEmail?: string;
}

interface ValidationResult {
  isFormValid: boolean;
  errors: FormErrors;
}

interface OrganizationValidationResult {
  isFormValid: boolean;
  errors: OrganizationFormErrors;
}

interface PasswordValidationResult {
  length: boolean;
  specialChar: boolean;
  uppercase: boolean;
  number: boolean;
}

/**
 * Validates form input values
 * @param values Form values to validate
 * @returns Validation result containing isFormValid flag and any errors
 */
// Function to validate the entire form
export const validateForm = (values: FormValues): ValidationResult => {
  const newErrors: FormErrors = {};

  // Validate name
  const name = checkStringValidation(
    "Name",
    values.name,
    VALIDATION_RULES.NAME.min,
    VALIDATION_RULES.NAME.max
  );
  if (!name.accepted) {
    newErrors.name = name.message;
  }

  // Validate surname
  const surname = checkStringValidation(
    "Surname",
    values.surname,
    VALIDATION_RULES.NAME.min,
    VALIDATION_RULES.NAME.max
  );
  if (!surname.accepted) {
    newErrors.surname = surname.message;
  }

  // Validate email
  const email = checkStringValidation(
    "Email",
    values.email,
    VALIDATION_RULES.EMAIL.min,
    VALIDATION_RULES.EMAIL.max,
    false,
    false,
    false,
    false,
    "email"
  );
  if (!email.accepted) {
    newErrors.email = email.message;
  }

  // Validate password
  const password = checkStringValidation(
    "Password",
    values.password,
    VALIDATION_RULES.PASSWORD.min,
    VALIDATION_RULES.PASSWORD.max,
    true,
    true,
    true,
    true,
    "password"
  );
  if (!password.accepted) {
    newErrors.password = password.message;
  }

  // Confirm password validation
  if (values.password !== values.confirmPassword) {
    newErrors.confirmPassword = "Password confirmation does not match. Please re-enter.";
  }

  return {
    isFormValid: Object.keys(newErrors).length === 0,
    errors: newErrors,
  }; // Return true if no errors exist
};

// Function to check Password based on the password input
export const validatePassword = (
  values: FormValues
): PasswordValidationResult => {
  return {
    length: values.password.length >= VALIDATION_RULES.PASSWORD.min,
    specialChar: PASSWORD_REGEX.test(values.password),
    uppercase: /[A-Z]/.test(values.password),
    number: /[0-9]/.test(values.password),
  };
};

/**
 * Validates organization form input values for multi-tenant mode
 * @param values Organization form values to validate
 * @returns Validation result containing isFormValid flag and any errors
 */
export const validateOrganizationForm = (
  values: OrganizationFormValues
): OrganizationValidationResult => {
  const newErrors: OrganizationFormErrors = {};

  // Validate organization name
  const organizationName = checkStringValidation(
    "Organization name",
    values.organizationName,
    VALIDATION_RULES.ORGANIZATION_NAME.min,
    VALIDATION_RULES.ORGANIZATION_NAME.max
  );
  if (!organizationName.accepted) {
    newErrors.organizationName = organizationName.message;
  }
  return {
    isFormValid: Object.keys(newErrors).length === 0,
    errors: newErrors,
  };
};
