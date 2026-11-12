/**
 * Pure helpers for the add/edit repository form.
 */

const WHOLE_NUMBER = /^\d+$/;

/** True when the input is a whole number with no sign, decimals or spaces. */
export function isWholeNumber(value: string): boolean {
  return WHOLE_NUMBER.test(value);
}

/** Error for the "Minimum governance score" field, or undefined when valid. */
export function minScoreError(value: string): string | undefined {
  if (!isWholeNumber(value) || Number(value) > 100) {
    return "Enter a whole number from 0 to 100";
  }
  return undefined;
}

/** Error for the "Max critical findings" field, or undefined when valid. */
export function maxCriticalError(value: string): string | undefined {
  if (!isWholeNumber(value)) {
    return "Enter a whole number of 0 or more";
  }
  return undefined;
}

// Scheduled scans are stored and run in UTC. The helper below shows the same
// moment in the viewer's own time zone next to the UTC picker.

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Format a UTC hour and minute as "HH:MM" in UTC and in the browser's time
 * zone. Today's date is used so daylight saving time is applied as it is now.
 */
export function formatUtcTimeInLocal(
  hour: number,
  minute: number,
  now: Date = new Date(),
  timeZone?: string,
): { utc: string; local: string } {
  const moment = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute),
  );
  const local = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(moment);
  return { utc: `${pad(hour)}:${pad(minute)}`, local };
}
