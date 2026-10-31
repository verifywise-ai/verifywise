/**
 * Get the configured server log retention period in days.
 * Reads LOG_RETENTION_DAYS from the environment; defaults to 14 days.
 *
 * @returns The retention period in days (integer >= 1), or 14 if the env var is unset, invalid, or <= 0.
 */
export function getServerLogRetentionDays(): number {
  const envValue = process.env.LOG_RETENTION_DAYS;

  // If unset, return default
  if (envValue === undefined) {
    return 14;
  }

  // Try to parse as integer
  const parsed = parseInt(envValue, 10);

  // Only accept whole numbers >= 1 where the string is a valid whole number (not a decimal or non-numeric)
  // Check that: the parsed value is valid (not NaN), is >= 1, and that parsing didn't truncate a decimal
  if (
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    envValue.trim() === String(parsed) // Ensure the original string is exactly the parsed integer
  ) {
    return parsed;
  }

  return 14;
}
