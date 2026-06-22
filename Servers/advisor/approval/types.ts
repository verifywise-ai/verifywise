/**
 * Phase 2 — XState Approval State Machine Types
 */

export type ApprovalState =
  | "idle"
  | "evaluate"
  | "auto_approve"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "auto_reject"
  | "executing"
  | "completed"
  | "failed";

export interface ApprovalContext {
  id: string;
  organizationId: number;
  userId: number;
  actionType: string;
  toolName: string;
  inputParams: Record<string, unknown>;
  riskLevel: "info" | "warning" | "danger";
  ruleMatched?: string;
  description: string;
  stateHistory: StateHistoryEntry[];
  result?: unknown;
  errorMessage?: string;
  createdAt: string;
  evaluatedAt?: string;
  approvedAt?: string;
  executedAt?: string;
}

export interface StateHistoryEntry {
  state: string;
  timestamp: string;
  actor?: string;
  reason?: string;
}

export type ApprovalEvent =
  | { type: "SUBMIT" }
  | { type: "APPROVE"; userId: number }
  | { type: "REJECT"; userId: number; reason?: string }
  | { type: "EXECUTE_SUCCESS"; result: unknown }
  | { type: "EXECUTE_FAILURE"; error: string };

export interface SubmitForApprovalConfig {
  organizationId: number;
  userId: number;
  toolName: string;
  actionType: string;
  riskLevel: "info" | "warning" | "danger";
  description: string;
  inputParams: Record<string, unknown>;
}
