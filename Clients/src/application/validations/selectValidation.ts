/**
 * Converts feedback information into an object containing acceptance status and a message.
 *
 * @param accepted - A boolean indicating whether the feedback is accepted.
 * @param message - A string containing the feedback message.
 * @returns An object with `accepted` and `message` properties.
 */
function feedback(accepted: boolean, message: string) {
  return {
    accepted,
    message,
  };
}

/**
 * Select field validation
 *
 * @param value - The value to be validated.
 * @returns An object with `accepted` set to `true` if the value passes all validations,
 *          otherwise an object with `accepted` set to `false` and a `message` indicating the reason.
 */
function selectValidation(
  title: string,
  value: number | number[],
): { accepted: boolean; message: string } {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return feedback(false, `${title} is required.`);
    }
    return feedback(true, "Success");
  }
  if (value === 0) {
    return feedback(false, `${title} is required.`);
  }
  return feedback(true, "Success");
}

export default selectValidation;
