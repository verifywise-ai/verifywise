import dayjs from "dayjs";
import { UserDateFormat } from "../../domain/enums/userDateFormat.enum";

/**
 * Converts an ISO date string to a formatted date string.
 *
 * @param {string} isoDate - The ISO date string to be converted.
 * @returns {string} The formatted date string in the format "1 November 2024".
 */
export function formatDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
    throw new Error("Invalid ISO date format");
  }

  const date = new Date(isoDate);
  const day = date.getUTCDate();
  const month = date.toLocaleString("default", {
    month: "long",
    timeZone: "UTC",
  });
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Converts an ISO date string to a formatted date string based on the user preference.
 *
 * @param {string} isoDate - The ISO date string to be converted.
 * @returns {string} The formatted date string in the format (default: DD-MM-YYYY).
 */
export const displayFormattedDate = (isoDate: string | Date): string => {
  const dateStr = isoDate instanceof Date ? isoDate.toISOString() : isoDate;

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    console.warn("Invalid ISO date format:", dateStr);
    return String(dateStr);
  }

  let dateFormat = UserDateFormat.DD_MM_YYYY_DASH;
  try {
    const preference = localStorage.getItem("verifywise_preferences");
    if (preference) {
      const parsed = JSON.parse(preference);
      dateFormat = parsed.date_format || UserDateFormat.DD_MM_YYYY_DASH;
    }
  } catch (error) {
    console.warn("Failed to read date format preference, using default:", error);
  }

  const formattedDate = dayjs(dateStr).format(dateFormat);
  return formattedDate;
};
/**
 * Converts an ISO date string to a formatted date and time string.
 *
 * @param {string} isoDate - The ISO date string to be converted.
 * @returns {string} The formatted date and time string in the format "1 November 2024, 14:30:25".
 */
export function formatDateTime(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
    throw new Error("Invalid ISO date format");
  }

  const date = new Date(isoDate);
  const day = date.getDate();
  const month = date.toLocaleString("default", {
    month: "long",
  });
  const year = date.getFullYear();

  // Format time with hours, minutes, and seconds
  const hours = date.getHours().toLocaleString().padStart(2, "0");
  const minutes = date.getMinutes().toLocaleString().padStart(2, "0");
  const seconds = date.getSeconds().toLocaleString().padStart(2, "0");

  return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds}`;
}
