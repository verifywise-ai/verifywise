/**
 * Validates if the given string meets the specified length and content requirements.
 *
 * @param value - The string value to be validated.
 * @param minLength - The optional minimum length the string can be.
 * @param maxLength - The optional maximum length the string can be.
 * @param allowEmpty - Whether empty strings are allowed (default: false).
 * @returns `true` if the value is valid, otherwise `false`.
 */
export function stringValidation(
  value: string | null | undefined,
  minLength?: number,
  maxLength?: number,
  allowEmpty = false,
): boolean {
  if (value === null || value === undefined) {
    return allowEmpty;
  }

  if (typeof value !== "string") {
    return false;
  }

  if (!allowEmpty && value.trim().length === 0) {
    return false;
  }

  const length = value.length;

  if (minLength !== undefined && length < minLength) {
    return false;
  }

  if (maxLength !== undefined && length > maxLength) {
    return false;
  }

  return true;
}

/**
 * Validates if the given value is one of the allowed enum values.
 *
 * @param value - The value to validate.
 * @param allowedValues - Array of allowed enum values.
 * @returns `true` if the value is in the allowed values, otherwise `false`.
 */
export function enumValidation<T>(value: T, allowedValues: T[]): boolean {
  return allowedValues.includes(value);
}
