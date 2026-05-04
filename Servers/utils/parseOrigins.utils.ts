/**
 * Parses a raw string input into an array of origin strings.
 *
 * The function attempts to interpret the input in the following order:
 * 1. If the input is a JSON array (e.g., '["url1", "url2"]'), it parses and returns the array.
 * 2. If the input is a comma-separated string (e.g., 'url1,url2'), it splits the string into an array of trimmed strings.
 * 3. If the input is a single origin string, it returns an array containing the trimmed string.
 *
 * If the input is falsy (e.g., `null` or `undefined`), it returns an empty array.
 *
 * @param raw - The raw string input to parse, which may be a JSON array, a comma-separated string, or a single origin.
 * @returns An array of origin strings parsed from the input.
 */

interface ParseOrigins {
  (raw: string | undefined): string[];
}
const parseOrigins: ParseOrigins = (raw) => {
  if (!raw) return [];

  try {
    // If it's a JSON array like '["url1", "url2"]'
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch (_) {
    // Not JSON, try comma-separated string
  }

  // Fallback: comma-separated string or single origin
  return raw.split(",").map((origin: string) => origin.trim());
};

/**
 * Tests whether a given origin is allowed based on a list of allowed origins.
 *
 * @param {Object} params - The parameters for testing the origin.
 * @param {string | undefined} params.origin - The origin to be tested. If undefined, it is considered allowed.
 * @param {string[]} params.allowedOrigins - An array of allowed origins to validate against.
 * @param {(error: Error | null, success: boolean) => void} params.callback - A callback function to handle the result.
 *        - If the origin is allowed, the callback is invoked with `null` as the error and `true` as the success flag.
 *        - If the origin is not allowed, the callback is invoked with an `Error` object and no success flag.
 */

interface TestOriginCallback {
  (err: Error | null, allow?: boolean): void;
}

interface AllowedOrigins {
  includes(origin: string): boolean;
}

interface TestOrigin {
  origin: string | undefined;
  allowedOrigins: AllowedOrigins;
  callback: TestOriginCallback;
}

const testOrigin = ({ origin, allowedOrigins, callback }: TestOrigin): void => {
  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, true);
  } else {
    callback(new Error("Not allowed by CORS"));
  }
};

export { parseOrigins, testOrigin };
