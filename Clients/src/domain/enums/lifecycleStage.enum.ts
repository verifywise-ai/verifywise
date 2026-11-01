/**
 * Inventory lifecycle (#5187): in review → planned → live → retired. Mirrors
 * Servers/domain.layer/enums/lifecycle-stage.enum.ts. Use cases use it now;
 * AI apps reuse it.
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

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  [LifecycleStage.IN_REVIEW]: "In review",
  [LifecycleStage.PLANNED]: "Planned",
  [LifecycleStage.LIVE]: "Live",
  [LifecycleStage.RETIRED]: "Retired",
};

/** Allowed "still live?" intervals, in days. Default 90. */
export const CONFIRMATION_INTERVAL_OPTIONS = [30, 90, 180] as const;
export type ConfirmationIntervalDays = (typeof CONFIRMATION_INTERVAL_OPTIONS)[number];

export type LifecycleStageCounts = Record<LifecycleStage, number>;
