/**
 * Validates a password based on specific criteria.
 *
 * @param password - The password string to validate.
 * @returns An object containing the validation results:
 * - `isValid`: Indicates if the password meets the required criteria (at least one lowercase letter, one uppercase letter, one digit, and a minimum length of 8 characters).
 * - `hasSpecialChar`: Indicates if the password contains any special characters.
 * - `isMinLength`: Indicates if the password meets the minimum length requirement.
 * - `isMaxLength`: Indicates if the password meets the maximum length requirement.
 */

export function passwordValidation(password: string): {
  isValid: boolean;
  hasSpecialChar: boolean;
  isMinLength: boolean;
  isMaxLength: boolean;
} {
  const specialCharRegex = /[!@#$%^&*(),.?":{}|<>]/;
  const minLength = 8;
  const maxLength = 32;

  // Check for required criteria: lowercase, uppercase, digit, and minimum length
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const isMinLength = password.length >= minLength;
  const isMaxLength = password.length <= maxLength;
  const hasSpecialChar = specialCharRegex.test(password);

  // Password is valid if it has lowercase, uppercase, digit, and meets minimum length
  const isValid = hasLowercase && hasUppercase && hasDigit && isMinLength;

  return { isValid, hasSpecialChar, isMinLength, isMaxLength };
}
