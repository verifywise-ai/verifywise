/**
 * Validates if the given string is a valid number and optionally checks if it falls within a specified range.
 *
 * @param value - The value to be validated as a number.
 * @param min - The optional minimum value the number can be.
 * @param max - The optional maximum value the number can be.
 * @returns `true` if the value is a valid number and falls within the specified range, otherwise `false`.
 */

export function numberValidation(value: string | number, min?: number, max?: number): boolean {
  if (typeof value === "number") {
    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
      return false;
    }
    return true;
  }

  const numberRegex = /^[0-9]*$/;
  if (!numberRegex.test(value)) {
    return false;
  }

  const num = parseInt(value, 10);
  if ((min !== undefined && num < min) || (max !== undefined && num > max)) {
    return false;
  }

  return true;
}
