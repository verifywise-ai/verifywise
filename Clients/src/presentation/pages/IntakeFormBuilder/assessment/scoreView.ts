// The numbers the review modal shows for a v2 assessment, recomputed for the
// level the reviewer has selected. Mirrors what the server saves on approve.
import type { RiskAssessmentV2 } from "../../../../application/repository/intakeForm.repository";
import {
  bandFor,
  combineScore,
  ruleMinimumFor,
  type ClassificationLevel,
  type ScoreBand,
  type ScoreSource,
} from "../../../../application/utils/intakeScoring/scoreMath";

export interface ScoreView {
  ruleMinimum: number | null;
  finalScore: number | null;
  band: ScoreBand | null;
  source: ScoreSource | null;
  rulesOnly: boolean;
}

/** The score under `level` (null: not rule-checked), from the stored AI median. */
export function scoreViewFor(
  assessment: RiskAssessmentV2,
  level: ClassificationLevel | null,
): ScoreView {
  const ruleMinimum = ruleMinimumFor(level);
  const aiMedian = assessment.status === "complete" ? (assessment.ai?.median ?? null) : null;
  const combined = combineScore({ ruleMinimum, aiMedian });
  return {
    ruleMinimum,
    finalScore: combined.finalScore,
    band: combined.finalScore === null ? null : bandFor(combined.finalScore),
    source: combined.source,
    rulesOnly: combined.rulesOnly,
  };
}

const STALE_PENDING_MS = 10 * 60 * 1000;

/** True when a stage failed, or has been "pending" long enough to be a lost job. */
export function isRetryable(
  stage: { status: string; stageStartedAt: string } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!stage) return false;
  if (stage.status === "ai_failed") return true;
  if (stage.status !== "pending") return false;
  const started = Date.parse(stage.stageStartedAt);
  return Number.isNaN(started) || now - started > STALE_PENDING_MS;
}
