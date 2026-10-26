import { IntakeSubmissionStatus } from "../enums/intake-submission-status.enum";
import { IntakeEntityType } from "../enums/intake-entity-type.enum";
import type {
  ClassificationLevel,
  ScoreBand,
  ScoreSource,
} from "../../services/intakeScoring/scoreMath";
import type { AiReason } from "../../services/intakeScoring/aiScoring";
import type { IntakeSuggestedRisk } from "../../services/intakeScoring/intakeSuggestions";

/**
 * Submission data stored as JSONB
 * Keys are field IDs, values are the submitted values
 */
export type IntakeSubmissionData = Record<string, unknown>;

/**
 * Risk dimension score
 */
export interface IRiskDimension {
  key: string;
  label: string;
  weight: number;
  score: number;
  signals: string[];
}

/**
 * Legacy (dimension-based) risk assessment stored on submission
 */
export interface IRiskAssessmentV1 {
  dimensions: IRiskDimension[];
  overallScore: number;
  tier: string;
  tierSystem: string;
  llmEnhanced: boolean;
}

/** Progress of one background stage (scoring or suggestions). */
export type StageStatus = "pending" | "complete" | "ai_not_configured" | "ai_failed";

/**
 * AI-assisted risk assessment (version 2): final score is
 * max(rule minimum, AI median).
 */
export interface IRiskAssessmentV2 {
  version: 2;
  status: StageStatus;
  notRuleChecked: boolean;
  classificationLevel: ClassificationLevel | null;
  ruleMinimum: number | null;
  ai: {
    runs: number[];
    failedRuns: number;
    validRuns: number;
    median: number | null;
    min: number | null;
    max: number | null;
    reasons: AiReason[];
  } | null;
  finalScore: number | null;
  source: ScoreSource | null;
  rulesOnly: boolean;
  /** Equals finalScore; keeps list and stats code working. */
  overallScore: number | null;
  /** Equals bandFor(finalScore). */
  tier: ScoreBand | null;
  stageStartedAt: string;
  scoredAt: string | null;
  error?: string;
}

export type IRiskAssessment = IRiskAssessmentV1 | IRiskAssessmentV2;

export function isAssessmentV2(
  assessment: IRiskAssessment | null,
): assessment is IRiskAssessmentV2 {
  return (
    assessment !== null &&
    typeof assessment === "object" &&
    (assessment as { version?: unknown }).version === 2
  );
}

export type ReviewLane = "senior" | "standard";

export type RoutingReason =
  | "prohibited"
  | "no_score"
  | "close_call"
  | "at_or_above_threshold"
  | "below_threshold"
  | "override_raised"
  | "escalated";

/**
 * Second-review sample taken from a standard-lane decision
 */
export interface ISecondReview {
  status: "open" | "agreed" | "missed";
  selectedAt: string;
  reviewedBy?: number;
  reviewedAt?: string;
  note?: string;
  resolvedBy?: number;
  resolvedAt?: string;
  resolutionNote?: string;
}

/**
 * Lane decision for one submission (intake_submissions.routing JSONB)
 */
export interface ISubmissionRouting {
  lane: ReviewLane;
  reason: RoutingReason;
  score: number | null;
  threshold: number;
  closeCallMargin: number;
  routedAt: string;
  escalation?: { by: number; at: string; reason: string };
  secondReview?: ISecondReview;
}

/**
 * Computed vs. in-force band frozen at decision time (decision_record JSONB)
 */
export interface IDecisionRecord {
  level: string | null;
  computedBand: string | null;
  bandInForce: string | null;
  bandChanged: boolean;
  overriddenBy: number | null;
  lane: ReviewLane | null;
}

/**
 * Suggested risks block stored on submission (suggested_risks JSONB)
 */
export interface ISuggestedRisksBlock {
  status: StageStatus;
  items: IntakeSuggestedRisk[];
  droppedCount: number;
  stageStartedAt: string;
  generatedAt: string | null;
  error?: string;
}

/**
 * Risk override by admin
 */
export interface IRiskOverride {
  tier: string;
  dimensionOverrides: Record<string, number>;
  justification: string;
  overriddenBy: number;
  overriddenAt: string;
}

/**
 * Intake submission entity
 */
export interface IIntakeSubmission {
  id: number;
  formId: number;
  submitterEmail: string | null;
  submitterName: string | null;
  data: IntakeSubmissionData;
  entityType: IntakeEntityType;
  entityId: number | null;
  status: IntakeSubmissionStatus;
  rejectionReason: string | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  originalSubmissionId: number | null;
  resubmissionCount: number;
  ipAddress: string | null;
  riskAssessment: IRiskAssessment | null;
  riskTier: string | null;
  riskOverride: IRiskOverride | null;
  suggestedRisks: ISuggestedRisksBlock | null;
  routing: ISubmissionRouting | null;
  decisionRecord: IDecisionRecord | null;
  notificationSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new submission (from public form)
 */
export interface ICreateIntakeSubmissionInput {
  formId: number;
  submitterEmail: string | null;
  submitterName: string | null;
  data: IntakeSubmissionData;
  entityType: IntakeEntityType;
  originalSubmissionId?: number;
  ipAddress?: string;
}

/**
 * Input for approving a submission
 */
export interface IApproveSubmissionInput {
  submissionId: number;
  reviewedBy: number;
}

/**
 * Input for rejecting a submission
 */
export interface IRejectSubmissionInput {
  submissionId: number;
  rejectionReason: string;
  reviewedBy: number;
}

/**
 * Submission with form details (for admin views)
 */
export interface IIntakeSubmissionWithForm extends IIntakeSubmission {
  form: {
    id: number;
    name: string;
    entityType: IntakeEntityType;
  };
}

/**
 * Summary stats for dashboard
 */
export interface IIntakeSubmissionStats {
  pending: number;
  approved: number;
  rejected: number;
  superseded: number;
  total: number;
}
