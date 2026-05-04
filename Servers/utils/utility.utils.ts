// Helper function to validate that an array contains only numbers
export const validateRiskArray = (riskArray: any[], arrayName: string): number[] => {
  if (!Array.isArray(riskArray)) {
    throw new Error(`${arrayName} must be an array`);
  }

  const validatedArray: number[] = [];

  for (let i = 0; i < riskArray.length; i++) {
    const item = riskArray[i];

    // Check if it's a number or a string that can be converted to a number
    if (typeof item === "number" && !isNaN(item) && Number.isInteger(item)) {
      validatedArray.push(item);
    } else {
      throw new Error(
        `${arrayName}[${i}] contains invalid value: "${item}". All items must be valid integers.`,
      );
    }
  }

  return validatedArray;
};

/**
 * Safely converts Express request parameter/query value (string | string[]) to string
 * If array, returns first element; if undefined, returns empty string
 */
export const toStringParam = (value: string | string[] | undefined): string => {
  if (value === undefined) return "";
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Helper to safely get a string parameter from req.params or req.query
 * Returns the first element if array, or the value if string, or empty string if undefined
 */
export const getStringParam = (value: string | string[] | undefined): string => {
  return Array.isArray(value) ? value[0] : value || "";
};

/**
 * Safely converts Express query value (string | string[] | ParsedQs) to string
 * Handles ParsedQs by converting to string, arrays by taking first element
 */
export const toStringQuery = (value: string | string[] | undefined | any): string => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value);
};
