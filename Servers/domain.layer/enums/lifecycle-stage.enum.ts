/**
 * Lifecycle of an inventory entry (#5187): in review → planned → live → retired.
 *
 * Kept apart from projects.status, which is a project-management state. Use
 * cases are the first entity with a lifecycle; AI apps reuse the same values.
 */
export enum LifecycleStage {
  IN_REVIEW = "in_review",
  PLANNED = "planned",
  LIVE = "live",
  RETIRED = "retired",
}

export const LIFECYCLE_STAGES: readonly LifecycleStage[] = [
  LifecycleStage.IN_REVIEW,
  LifecycleStage.PLANNED,
  LifecycleStage.LIVE,
  LifecycleStage.RETIRED,
];

/** Allowed values for the org-wide "still live?" interval, in days. */
export const CONFIRMATION_INTERVAL_OPTIONS = [30, 90, 180] as const;
export type ConfirmationIntervalDays = (typeof CONFIRMATION_INTERVAL_OPTIONS)[number];
export const DEFAULT_CONFIRMATION_INTERVAL_DAYS: ConfirmationIntervalDays = 90;

export function isLifecycleStage(value: unknown): value is LifecycleStage {
  return typeof value === "string" && (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

export function isConfirmationInterval(value: unknown): value is ConfirmationIntervalDays {
  return (
    typeof value === "number" &&
    (CONFIRMATION_INTERVAL_OPTIONS as readonly number[]).includes(value)
  );
}
