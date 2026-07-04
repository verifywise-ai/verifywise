import { format, isValid, parseISO } from "date-fns";
import { UserDateFormat } from "../../domain/enums/userDateFormat.enum";
import { storageService } from "../../infrastructure/storage";

const DATE_FORMAT_MAP: Record<UserDateFormat, string> = {
  [UserDateFormat.DD_MM_YYYY_DASH]: "dd-MM-yyyy",
  [UserDateFormat.MM_DD_YYYY_DASH]: "MM-dd-yyyy",
  [UserDateFormat.DD_MM_YY_SLASH]: "dd/MM/yy",
  [UserDateFormat.MM_DD_YY_SLASH]: "MM/dd/yy",
};

const getPreferredDateFormat = (): string => {
  const preferences = storageService.get("preferences", {});
  const dateFormat = preferences.date_format as UserDateFormat | undefined;

  return dateFormat && DATE_FORMAT_MAP[dateFormat]
    ? DATE_FORMAT_MAP[dateFormat]
    : DATE_FORMAT_MAP[UserDateFormat.DD_MM_YYYY_DASH];
};

const parseDateValue = (value: string | Date): Date | null => {
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

/**
 * Converts an ISO date string to a formatted date string based on the user preference.
 *
 * @param {string} isoDate - The ISO date string to be converted.
 * @returns {string} The formatted date string in the format (default: DD-MM-YYYY).
 */
export const displayFormattedDate = (isoDate: string | Date): string => {
  const date = parseDateValue(isoDate);

  if (!date) {
    console.warn("Invalid ISO date format:", isoDate);
    return String(isoDate);
  }

  return format(date, getPreferredDateFormat());
};

/**
 * Converts an ISO date string to a formatted date string based on the user preference.
 */
export function formatDate(isoDate: string | Date): string {
  const date = parseDateValue(isoDate);

  if (!date) {
    throw new Error("Invalid ISO date format");
  }

  return format(date, getPreferredDateFormat());
}

/**
 * Converts an ISO date string to a formatted time string.
 */
export function displayFormattedTime(
  isoDate: string | Date,
  options: { includeSeconds?: boolean } = {},
): string {
  const date = parseDateValue(isoDate);

  if (!date) {
    console.warn("Invalid ISO date format:", isoDate);
    return String(isoDate);
  }

  return format(date, options.includeSeconds ? "HH:mm:ss" : "HH:mm");
}

/**
 * Converts an ISO date string to a formatted date and time string.
 */
export function displayFormattedDateTime(
  isoDate: string | Date,
  options: { includeSeconds?: boolean; separator?: string } = {},
): string {
  const date = parseDateValue(isoDate);

  if (!date) {
    console.warn("Invalid ISO date format:", isoDate);
    return String(isoDate);
  }

  const separator = options.separator ?? ", ";
  return `${format(date, getPreferredDateFormat())}${separator}${format(
    date,
    options.includeSeconds ? "HH:mm:ss" : "HH:mm",
  )}`;
}

/**
 * Converts an ISO date string to a formatted date and time string.
 *
 * @param {string} isoDate - The ISO date string to be converted.
 * @returns {string} The formatted date and time string in the format "1 November 2024, 14:30:25".
 */
export function formatDateTime(isoDate: string): string {
  if (!parseDateValue(isoDate)) {
    throw new Error("Invalid ISO date format");
  }

  return displayFormattedDateTime(isoDate, { includeSeconds: true });
}
