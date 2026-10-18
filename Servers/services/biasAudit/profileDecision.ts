/**
 * What a profile's answers decide for the steps after it: the readiness
 * result (and with it the scope) and the rate a run computes.
 *
 * A run takes its metric from here and a scope determination its scope, both
 * from the attested profile's answers. The profile view reports the same
 * decision for the attested profile, so the page gates runs and scope
 * determinations on what the server will act on, not on a draft.
 */
import { runAnswerGates, type AnswerGateResult } from "./answerGates";
import type { AnswerMap } from "./applicability";
import { computeReadiness, type ReadinessResult } from "./readinessScore";

export const RUN_METRICS = ["selection_rate", "scoring_rate"] as const;
export type RunMetric = (typeof RUN_METRICS)[number];

/** The rate the answers force a run to compute, or null when they force none the engine runs. */
export function runMetricOf(gates: AnswerGateResult): RunMetric | null {
  const m = gates.forcedMetric;
  return m !== null && (RUN_METRICS as readonly string[]).includes(m) ? (m as RunMetric) : null;
}

export interface ProfileDecision {
  readiness: ReadinessResult;
  /** Null when no applicable answer forces a rate (out of scope, or the cutoff is open). */
  metric: RunMetric | null;
}

export function decideProfile(answers: AnswerMap): ProfileDecision {
  return {
    readiness: computeReadiness(answers),
    metric: runMetricOf(runAnswerGates(answers)),
  };
}
