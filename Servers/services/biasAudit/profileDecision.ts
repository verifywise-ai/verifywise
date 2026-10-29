/**
 * What a profile's answers decide for the steps after it: the readiness
 * result (and with it the scope), the rate a run computes, and whether a
 * corpus may be generated.
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
  /** Whether the answers allow corpus generation. */
  mayGenerate: boolean;
  /** Why generation is withheld, each naming the question; empty when it may run. */
  generationBlocked: string[];
}

export function decideProfile(answers: AnswerMap): ProfileDecision {
  const gates = runAnswerGates(answers);
  return {
    readiness: computeReadiness(answers),
    metric: runMetricOf(gates),
    mayGenerate: gates.mayGenerate,
    generationBlocked: [...gates.blocked.generation],
  };
}
