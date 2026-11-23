/**
 * Schedule choices shared by the create wizard and the scheduled report edit
 * dialog, so the two lists cannot drift. Mirrors scheduleCalculator.ts.
 */

export const FREQUENCY_ITEMS = [
  { _id: "daily", name: "Daily" },
  { _id: "weekly", name: "Weekly" },
  { _id: "monthly", name: "Monthly" },
  { _id: "quarterly", name: "Quarterly" },
];

// String ids: the shared Select matches a picked option by strict equality,
// and the native input it is labelled by carries strings.
export const MONTH_ITEMS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((name, i) => ({ _id: String(i + 1), name }));

/** Next month (1-12): a new quarterly schedule first runs after the current month ends. */
export const defaultAnchorMonth = () => ((new Date().getMonth() + 1) % 12) + 1;

/** The span one run of each frequency reports on, for the period hint. */
export const FREQUENCY_INTERVAL: Record<string, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
};

/**
 * A schedule config with the frequency changed: quarterly gains a run-in month
 * (kept if it already had one), every other frequency loses it, since the
 * server reads anchorMonth for quarterly schedules only.
 */
export function withFrequency<T extends { frequency: string; anchorMonth?: number }>(
  schedule: T,
  frequency: string,
): T {
  const { anchorMonth, ...rest } = schedule;
  if (frequency !== "quarterly") return { ...rest, frequency } as T;
  return { ...rest, frequency, anchorMonth: anchorMonth ?? defaultAnchorMonth() } as T;
}
