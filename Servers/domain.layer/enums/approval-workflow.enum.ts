/**
 * Approval workflow enumerations
 */

import { AiRiskClassification } from "./ai-risk-classification.enum";

export enum ApprovalStatus {
  PENDING = "Pending",
  APPROVED = "Approved",
  REJECTED = "Rejected",
}

export enum ApprovalRequestStatus {
  PENDING = "Pending",
  APPROVED = "Approved",
  REJECTED = "Rejected",
  WITHDRAWN = "Withdrawn",
}

export enum ApprovalStepStatus {
  PENDING = "Pending",
  COMPLETED = "Completed",
  REJECTED = "Rejected",
}

export enum ApprovalResult {
  APPROVED = "Approved",
  REJECTED = "Rejected",
  PENDING = "Pending",
}

export enum EntityType {
  USE_CASE = "use_case",
  FILE = "file",
  RISK = "risk",
  VENDOR = "vendor",
  MODEL_INVENTORY = "model_inventory",
  POLICY = "policy",
  INCIDENT = "incident",
  TASK = "task",
  DATASET = "dataset",
  TRAINING = "training",
  EVIDENCE = "evidence",
  AI_ACTION = "ai_action",
  AUTOMATION = "automation",
  PMM_CONFIG = "pmm_config",
  NOTE = "note",
}

/**
 * AI risk classifications eligible for risk-based auto-approval, ordered from
 * lowest to highest rank. A workflow's auto_approve_max_risk threshold
 * auto-approves use cases whose classification ranks at or below the
 * threshold. Classifications not listed here (GPAI, General Risk) -- and
 * missing or unrecognized values -- are never auto-approved.
 */
export const AUTO_APPROVABLE_RISK_RANKS: Readonly<Record<string, number>> = {
  [AiRiskClassification.MINIMAL_RISK]: 1,
  [AiRiskClassification.LIMITED_RISK]: 2,
  [AiRiskClassification.HIGH_RISK]: 3,
  [AiRiskClassification.PROHIBITED]: 4,
};
