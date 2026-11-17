import { formatDistanceToNow, isValid } from "date-fns";

/**
 * Format a date to a human-readable relative time format
 * Uses date-fns for consistent, localized relative time formatting
 * @param dateInput - ISO date string, date-parseable string, or Date object
 * @returns Formatted date string (e.g., "5 minutes ago", "about 2 hours ago", "3 days ago")
 */
export const formatRelativeDate = (dateInput: string | Date): string => {
  if (!dateInput) return "Unknown";

  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    // PostgreSQL returns timestamps without timezone info (e.g., "2026-02-19 21:30:00")
    // We need to treat them as UTC by replacing space with 'T' and appending 'Z'
    let normalizedDateString = dateInput.trim();

    // Replace space with 'T' for ISO format
    normalizedDateString = normalizedDateString.replace(" ", "T");

    // Append 'Z' if no timezone indicator present
    if (!normalizedDateString.endsWith("Z") && !normalizedDateString.match(/[+-]\d{2}:?\d{2}$/)) {
      normalizedDateString += "Z";
    }

    date = new Date(normalizedDateString);
  }
  if (!isValid(date)) return "Unknown";

  return formatDistanceToNow(date, { addSuffix: true });
};
