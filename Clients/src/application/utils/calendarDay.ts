import dayjs from "dayjs";

/**
 * The calendar day the user picked, as an instant at noon UTC. The server
 * reads such dates as UTC days (Home queue, vendor review reminders), and noon
 * keeps the same day in every time zone from UTC-12 to UTC+11. Empty stays
 * empty.
 */
export const calendarDayAtNoonUtc = (value: string | Date | null | undefined): string => {
  if (!value) return "";
  const day = dayjs(value);
  return day.isValid() ? `${day.format("YYYY-MM-DD")}T12:00:00.000Z` : "";
};
