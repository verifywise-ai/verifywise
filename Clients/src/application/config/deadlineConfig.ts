export interface DeadlineThresholds {
  /** Tasks due within this many days (inclusive of today) are considered "due soon". */
  dueSoonDays: number;
}

export const DEADLINE_CONFIG: DeadlineThresholds = {
  dueSoonDays: 14,
};

/** Snooze durations (in milliseconds) offered in the banner's snooze menu. */
export const SNOOZE_DURATIONS = {
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

export interface SnoozeOption {
  label: string;
  durationMs: number;
}

/** Options rendered in the snooze dropdown, in display order. */
export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { label: "Snooze for 1 hour", durationMs: SNOOZE_DURATIONS.ONE_HOUR },
  { label: "Snooze for 24 hours", durationMs: SNOOZE_DURATIONS.ONE_DAY },
  { label: "Snooze for 1 week", durationMs: SNOOZE_DURATIONS.ONE_WEEK },
];
