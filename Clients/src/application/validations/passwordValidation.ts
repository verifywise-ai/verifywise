/**
 * Mirrors Servers/domain.layer/validations/password.valid.ts.
 * Keep in sync — this is the frontend SSOT for the same rule.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordValidation(password: string): {
  isValid: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasDigit: boolean;
  isMinLength: boolean;
  isMaxLength: boolean;
} {
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const isMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const isMaxLength = password.length <= PASSWORD_MAX_LENGTH;

  return {
    isValid: hasLowercase && hasUppercase && hasDigit && isMinLength && isMaxLength,
    hasLowercase,
    hasUppercase,
    hasDigit,
    isMinLength,
    isMaxLength,
  };
}
