/**
 * Approval workflow enumerations
 */

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
