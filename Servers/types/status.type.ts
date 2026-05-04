export const STATUSES = [
  "Not started",
  "Draft",
  "In progress",
  "Awaiting review",
  "Awaiting approval",
  "Implemented",
  // "Audited",
  "Needs rework",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUSES_COMPLIANCE = ["Waiting", "In progress", "Done"];

export type StatusCompliance = (typeof STATUSES_COMPLIANCE)[number];

export const STATUSES_ANSWERS = ["Not started", "In progress", "Done"];

export type StatusAnswers = (typeof STATUSES_ANSWERS)[number];
