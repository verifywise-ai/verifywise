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
  /**
   * The requester's local date ("YYYY-MM-DD") when they proposed the action,
   * already checked (acceptedClientDate). Set by the server, never from the
   * model. Stored with the params as REQUESTER_CLIENT_DATE_PARAM and passed
   * to the executor, so a day the action records (an incident's occurred
   * date) is the requester's, not the approver's.
   */
  requesterClientDate?: string;
}

/**
 * The executor param carrying the requester's local date at proposal time
 * (SubmitForApprovalConfig.requesterClientDate). Server-set: the tool bridge
 * drops every underscore param the model sends, and the write tool wrapper
 * drops this one from the caller's params.
 */
export const REQUESTER_CLIENT_DATE_PARAM = "_requesterClientDate";
