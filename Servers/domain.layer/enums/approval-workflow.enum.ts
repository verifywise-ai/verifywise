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
  AI_ACTION = "ai_action",
}
