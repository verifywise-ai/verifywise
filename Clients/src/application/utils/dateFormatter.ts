import { formatDistanceToNow, isValid } from "date-fns";

/**
 * Format a date string to a human-readable relative time format
 * Uses date-fns for consistent, localized relative time formatting
 * @param dateString - ISO date string or date-parseable string
 * @returns Formatted date string (e.g., "5 minutes ago", "about 2 hours ago", "3 days ago")
 */
export const formatRelativeDate = (dateString: string): string => {
  if (!dateString) return "Unknown";

  // PostgreSQL returns timestamps without timezone info (e.g., "2026-02-19 21:30:00")
  // We need to treat them as UTC by replacing space with 'T' and appending 'Z'
  let normalizedDateString = dateString.trim();

  // Replace space with 'T' for ISO format
  normalizedDateString = normalizedDateString.replace(" ", "T");

  // Append 'Z' if no timezone indicator present
  if (!normalizedDateString.endsWith("Z") && !normalizedDateString.match(/[+-]\d{2}:?\d{2}$/)) {
    normalizedDateString += "Z";
  }

  const date = new Date(normalizedDateString);
  if (!isValid(date)) return "Unknown";

  return formatDistanceToNow(date, { addSuffix: true });
};
