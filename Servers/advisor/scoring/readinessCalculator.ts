import type { ReadinessLevel } from "../../domain.layer/interfaces/i.readiness";

/**
 * Readiness scoring weights — deterministic formula.
 * overall = evidence_quality * 0.30 + evidence_count * 0.20 +
 *           evidence_recency * 0.15 + task_completion * 0.20 +
 *           risk_mitigation * 0.15
 */
export const READINESS_WEIGHTS = {
  evidence_quality: 0.3,
  evidence_count: 0.2,
  evidence_recency: 0.15,
  task_completion: 0.2,
  risk_mitigation: 0.15,
} as const;

/**
 * Readiness level thresholds.
 */
export const READINESS_THRESHOLDS = {
  ready: 80,
  needs_work: 60,
  at_risk: 30,
} as const;

export interface ReadinessInput {
  evidence_quality: number; // avg quality score of linked evidence (0-100)
  evidence_count: number; // normalized count score (0-100)
  evidence_recency: number; // freshness of evidence (0-100)
  task_completion: number; // % of linked tasks completed (0-100)
  risk_mitigation: number; // % of linked risks mitigated (0-100)
}

export interface ReadinessResult {
  evidence_quality_score: number;
  evidence_count_score: number;
  evidence_recency_score: number;
  task_completion_score: number;
  risk_mitigation_score: number;
  overall_score: number;
  readiness_level: ReadinessLevel;
}

/**
 * Classify overall score into a readiness level.
 */
export function classifyReadinessLevel(score: number): ReadinessLevel {
  if (score >= READINESS_THRESHOLDS.ready) return "ready";
  if (score >= READINESS_THRESHOLDS.needs_work) return "needs_work";
  if (score >= READINESS_THRESHOLDS.at_risk) return "at_risk";
  return "not_started";
}

/**
 * Calculate the overall readiness score using weighted formula.
 */
export function calculateReadinessScore(input: ReadinessInput): ReadinessResult {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  const eq = clamp(input.evidence_quality);
  const ec = clamp(input.evidence_count);
  const er = clamp(input.evidence_recency);
  const tc = clamp(input.task_completion);
  const rm = clamp(input.risk_mitigation);

  const overall = Math.round(
    eq * READINESS_WEIGHTS.evidence_quality +
      ec * READINESS_WEIGHTS.evidence_count +
      er * READINESS_WEIGHTS.evidence_recency +
      tc * READINESS_WEIGHTS.task_completion +
      rm * READINESS_WEIGHTS.risk_mitigation,
  );

  return {
    evidence_quality_score: eq,
    evidence_count_score: ec,
    evidence_recency_score: er,
    task_completion_score: tc,
    risk_mitigation_score: rm,
    overall_score: overall,
    readiness_level: classifyReadinessLevel(overall),
  };
}

/**
 * Normalize evidence count to a 0-100 scale.
 * 0 evidence → 0, 1 → 30, 2 → 55, 3 → 75, 5+ → 100
 */
export function normalizeEvidenceCount(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 30;
  if (count === 2) return 55;
  if (count === 3) return 75;
  if (count === 4) return 90;
  return 100;
}

/**
 * Normalize evidence recency to 0-100 based on days since most recent evidence.
 * 0-7 days → 100, 8-30 days → 80, 31-90 days → 60, 91-180 days → 40, 180+ → 20
 */
export function normalizeRecency(daysSinceLatest: number | null): number {
  if (daysSinceLatest === null) return 0; // no evidence at all
  if (daysSinceLatest <= 7) return 100;
  if (daysSinceLatest <= 30) return 80;
  if (daysSinceLatest <= 90) return 60;
  if (daysSinceLatest <= 180) return 40;
  return 20;
}

export interface FrameworkAggregation {
  framework_type: string;
  total_controls: number;
  avg_score: number;
  ready_count: number;
  needs_work_count: number;
  at_risk_count: number;
  not_started_count: number;
  weakest_controls: Array<{
    control_id: number;
    overall_score: number;
    readiness_level: ReadinessLevel;
  }>;
}

/**
 * Aggregate per-control scores into framework-level summary.
 */
export function aggregateFrameworkScores(
  controlScores: Array<{
    control_id: number;
    overall_score: number;
    readiness_level: ReadinessLevel;
  }>,
  frameworkType: string,
): FrameworkAggregation {
  const total = controlScores.length;
  if (total === 0) {
    return {
      framework_type: frameworkType,
      total_controls: 0,
      avg_score: 0,
      ready_count: 0,
      needs_work_count: 0,
      at_risk_count: 0,
      not_started_count: 0,
      weakest_controls: [],
    };
  }

  const sum = controlScores.reduce((acc, c) => acc + c.overall_score, 0);
  const avg = Math.round(sum / total);

  const counts = { ready: 0, needs_work: 0, at_risk: 0, not_started: 0 };
  controlScores.forEach((c) => {
    counts[c.readiness_level]++;
  });

  // Weakest controls — bottom 5 by score
  const weakest = [...controlScores]
    .sort((a, b) => a.overall_score - b.overall_score)
    .slice(0, 5)
    .map((c) => ({
      control_id: c.control_id,
      overall_score: c.overall_score,
      readiness_level: c.readiness_level,
    }));

  return {
    framework_type: frameworkType,
    total_controls: total,
    avg_score: avg,
    ready_count: counts.ready,
    needs_work_count: counts.needs_work,
    at_risk_count: counts.at_risk,
    not_started_count: counts.not_started,
    weakest_controls: weakest,
  };
}
