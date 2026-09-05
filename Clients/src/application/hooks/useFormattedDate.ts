import { useCallback } from "react";
import { UserDateFormat } from "../../domain/enums/userDateFormat.enum";
import {
  displayFormattedDate,
  displayFormattedDateTime,
} from "../../presentation/tools/isoDateToString";
import useUserPreferences from "./useUserPreferences";

export interface FormatDateOptions {
  includeTime?: boolean;
  includeSeconds?: boolean;
  separator?: string;
}

/**
 * Preference-aware date formatter. Call once in the component body, then use
 * the returned function in maps/tables (hooks cannot be called per row).
 *
 * Reads `date_format` from the authenticated user's preferences query, not
 * from JWT or localStorage, so the UI re-renders when the preference changes.
 */
const useFormattedDate = () => {
  const { userPreferences } = useUserPreferences();
  const dateFormat = userPreferences.date_format ?? UserDateFormat.DD_MM_YYYY_DASH;

  return useCallback(
    (date: string | Date | null | undefined, options: FormatDateOptions = {}): string => {
      if (date === null || date === undefined || date === "") {
        return "—";
      }

      if (options.includeTime) {
        return displayFormattedDateTime(date, {
          includeSeconds: options.includeSeconds,
          separator: options.separator,
          dateFormat,
        });
      }

      return displayFormattedDate(date, dateFormat);
    },
    [dateFormat],
  );
};

export default useFormattedDate;
