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

const resolveDateFnsPattern = (dateFormat?: UserDateFormat): string => {
  if (dateFormat && DATE_FORMAT_MAP[dateFormat]) {
    return DATE_FORMAT_MAP[dateFormat];
  }
  return getPreferredDateFormat();
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
 * The calendar date ("YYYY-MM-DD") of a date-only value such as a policy's
 * next review date. The server stores these at midnight and returns them as
 * "YYYY-MM-DDT00:00:00.000Z"; formatting that full timestamp in a time zone
 * west of UTC would show the previous day, so callers format this instead
 * (parseISO reads a bare date as local midnight).
 */
export const toDateOnlyString = (value: string | Date | null | undefined): string => {
  if (!value) return "";
  if (value instanceof Date) return isValid(value) ? value.toISOString().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
};

/**
 * The calendar day of a risk deadline or assessment date, as local midnight of
 * that day. Use it wherever these risk dates are shown, compared or edited.
 *
 * Policies store calendar dates at UTC midnight (see toDateOnlyString); risks
 * store them at exactly 12:00 UTC, and older risk rows may hold a browser's
 * local midnight or another time. So:
 * - "YYYY-MM-DD": that day;
 * - exactly 12:00 UTC: the UTC date (reading the instant locally would show
 *   the next day from UTC+12 and move the date forward on every save);
 * - anything else: the local date of the instant, as before.
 */
export const riskCalendarDay = (value: unknown): Date | null => {
  if (!value || (typeof value !== "string" && !(value instanceof Date))) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const parsed = parseISO(value.trim()); // a bare date parses as local midnight
    return isValid(parsed) ? parsed : null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!isValid(date)) return null;

  const isStoredNoon =
    date.getUTCHours() === 12 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return isStoredNoon
    ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/** A local date as "YYYY-MM-DD", or "" when there is none. */
export const toLocalDateOnly = (date: Date | null | undefined): string =>
  date && isValid(date) ? format(date, "yyyy-MM-dd") : "";

/**
 * Converts an ISO date string to a formatted date string based on the user preference.
 *
 * @param {string} isoDate - The ISO date string to be converted.
 * @returns {string} The formatted date string in the format (default: DD-MM-YYYY).
 */
export const displayFormattedDate = (
  isoDate: string | Date,
  dateFormat?: UserDateFormat,
): string => {
  const date = parseDateValue(isoDate);

  if (!date) {
    console.warn("Invalid ISO date format:", isoDate);
    return String(isoDate);
  }

  return format(date, resolveDateFnsPattern(dateFormat));
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
  options: {
    includeSeconds?: boolean;
    separator?: string;
    dateFormat?: UserDateFormat;
  } = {},
): string {
  const date = parseDateValue(isoDate);

  if (!date) {
    console.warn("Invalid ISO date format:", isoDate);
    return String(isoDate);
  }

  const separator = options.separator ?? ", ";
  return `${format(date, resolveDateFnsPattern(options.dateFormat))}${separator}${format(
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
