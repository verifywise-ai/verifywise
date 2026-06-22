/**
 * Phase 2 — Approval Rules (Sync Guards + Async Engine)
 *
 * Sync guards for XState machine (fast, used for immediate routing).
 * Async evaluateRules() for full rule engine evaluation (used by gateway).
 */

import { writeToolExecutors } from "../confirmation/createWriteTool";
import type { ApprovalContext } from "./types";

// Re-export rule engine for gateway use
export { evaluateRules, deriveFacts, testRule } from "./ruleEngine";
export type { ApprovalFacts, RuleEvaluationResult, RuleDecision } from "./ruleEngine";

/**
 * Auto-approve low-risk (info-level) operations.
 * Sync guard for XState — fast path.
 */
export function isAutoApprovable(context: ApprovalContext): boolean {
  return context.riskLevel === "info";
}

/**
 * Auto-reject if the tool has no registered executor.
 */
export function isAutoRejectable(context: ApprovalContext): boolean {
  return !writeToolExecutors.has(context.toolName);
}

/**
 * Default path: require human approval.
 */
export function requiresApproval(context: ApprovalContext): boolean {
  return !isAutoApprovable(context) && !isAutoRejectable(context);
}
