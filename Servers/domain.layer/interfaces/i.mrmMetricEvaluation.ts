import { MrmEvalStatus, MrmThresholdOp, MrmThresholdSeverity } from "../enums/mrmMonitoring.enum";

/**
 * A frozen copy of the threshold at evaluation time, stored on the evaluation
 * record so a later threshold change never rewrites history.
 */
export interface MrmThresholdSnapshot {
  op?: MrmThresholdOp;
  value_num?: number;
  value_lo?: number;
  value_hi?: number;
  severity?: MrmThresholdSeverity;
  segment?: string;
  window?: string;
}

/**
 * One immutable evaluation of an ingested point against a threshold.
 * `threshold_id` is null for the no_threshold case (or if the threshold was
 * later deleted — the snapshot preserves what was evaluated).
 */
export interface IMrmMetricEvaluation {
  id?: number;
  organization_id: number;
  metric_id: number;
  threshold_id?: number;
  status: MrmEvalStatus;
  threshold_snapshot?: MrmThresholdSnapshot;
  evaluated_at?: Date;
}
