import { isValidEmail } from "./emailAddress.rule";

/**
 * Converts feedback information into an object containing acceptance status and a message.
 *
 * @param accepted - A boolean indicating whether the feedback is accepted.
 * @param message - A string containing the feedback message.
 * @returns An object with `accepted` and `message` properties.
 */
function feedbackToString(accepted: boolean, message: string) {
  return {
    accepted,
    message,
  };
}

/**
 * Validates a string based on various criteria such as length, presence of uppercase letters,
 * lowercase letters, numbers, special characters, and a custom regular expression.
 *
 * @param value - The string to be validated.
 * @param minLength - The minimum length the string should have.
 * @param maxLength - The maximum length the string can have.
 * @param regex - A regular expression that the string must match.
 * @param hasUpperCase - Whether the string must contain at least one uppercase letter.
 * @param hasLowerCase - Whether the string must contain at least one lowercase letter.
 * @param hasNumber - Whether the string must contain at least one number.
 * @param hasSpecialCharacter - Whether the string must contain at least one special character.
 * @returns An object with `accepted` set to `true` if the string passes all validations,
 *          otherwise an object with `accepted` set to `false` and a `message` indicating the reason.
 */
export function checkStringValidation(
  title: string,
  value: string,
  minLength: number = 0,
  maxLength: number = 128,
  hasUpperCase?: boolean,
  hasLowerCase?: boolean,
  hasNumber?: boolean,
  hasSpecialCharacter?: boolean,
  type?: string,
): { accepted: boolean; message: string } {
  if (
    (value === undefined ||
      value === null ||
      value.length === 0 ||
      value === "" ||
      value === " ") &&
    minLength > 0
  ) {
    return feedbackToString(false, `${title} is required.`);
  }

  if (value.length > 0 && type !== "password" && value.trim() === "") {
    return feedbackToString(false, `${title} cannot be an empty string.`);
  }

  if (value.length < minLength) {
    return feedbackToString(false, `${title} can't be shorter than ${minLength} characters.`);
  }

  if (value.length > maxLength) {
    return feedbackToString(false, `${title} can't be longer than ${maxLength} characters.`);
  }

  if (hasUpperCase && !/[A-Z]/.test(value)) {
    return feedbackToString(false, `${title} must contain at least one uppercase letter.`);
  }

  if (hasLowerCase && !/[a-z]/.test(value)) {
    return feedbackToString(false, `${title} must contain at least one lowercase letter.`);
  }

  if (hasNumber && !/[0-9]/.test(value)) {
    return feedbackToString(false, `${title} must contain at least one number.`);
  }

  if (hasSpecialCharacter && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+/.test(value)) {
    return feedbackToString(false, `${title} must contain at least one special character.`);
  }

  if (type == "email") {
    if (isValidEmail(value)) {
      return feedbackToString(true, "Success");
    } else {
      return feedbackToString(false, `Invalid ${title}.`);
    }
  }

  // Custom validation for vendor contact person
  if (type === "contactPerson") {
    if (!/^[a-zA-Z\s]+$/.test(value.trim())) {
      return feedbackToString(false, `${title} must only contain letters and spaces`);
    }
  }

  return feedbackToString(true, "Success");
}
