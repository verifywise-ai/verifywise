// Servers/services/intakeScoring/retry.ts
// Which assessment stages a reviewer's Retry re-runs. A stage that finished
// (complete, or no LLM key) is never re-run, so reviewer decisions on
// suggestions are never wiped by a retry.
import {
  isAssessmentV2,
  IRiskAssessment,
  ISuggestedRisksBlock,
  StageStatus,
} from "../../domain.layer/interfaces/i.intakeSubmission";
import type { ILiveChecks } from "../../domain.layer/interfaces/i.intakeLiveChecks";
import type { AssessmentStage } from "./enqueue";

/** A stage "pending" for longer than this is treated as a lost job. */
export const STALE_PENDING_MS = 10 * 60 * 1000;

function needsRetry(
  stage: { status: StageStatus; stageStartedAt: string } | null,
  now: Date,
): boolean {
  // Never stored: the job was never queued or never started.
  if (!stage) return true;
  if (stage.status === "ai_failed") return true;
  return stage.status === "pending" && isStale(stage.stageStartedAt, now);
}

function isStale(stageStartedAt: string | undefined, now: Date): boolean {
  const started = Date.parse(stageStartedAt ?? "");
  return Number.isNaN(started) || now.getTime() - started > STALE_PENDING_MS;
}

/** AI live checks that failed, or are pending past the stale limit. None stored: nothing to run. */
function liveChecksNeedRetry(liveChecks: ILiveChecks | null | undefined, now: Date): boolean {
  const ai = liveChecks?.ai;
  if (!ai) return false;
  if (ai.status === "failed") return true;
  return ai.status === "pending" && isStale(ai.stageStartedAt, now);
}

export function selectRetryStages(
  assessment: IRiskAssessment | null,
  block: ISuggestedRisksBlock | null,
  now: Date,
  liveChecks?: ILiveChecks | null,
): AssessmentStage[] {
  const stages: AssessmentStage[] = [];
  if (needsRetry(isAssessmentV2(assessment) ? assessment : null, now)) stages.push("scoring");
  if (needsRetry(block, now)) stages.push("suggestions");
  if (liveChecksNeedRetry(liveChecks, now)) stages.push("liveChecks");
  return stages;
}
