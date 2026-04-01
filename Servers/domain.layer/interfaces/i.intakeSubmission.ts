import { IntakeSubmissionStatus } from "../enums/intake-submission-status.enum";
import { IntakeEntityType } from "../enums/intake-entity-type.enum";

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
 * Risk assessment result stored on submission
 */
export interface IRiskAssessment {
  dimensions: IRiskDimension[];
  overallScore: number;
  tier: string;
  tierSystem: string;
  llmEnhanced: boolean;
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
