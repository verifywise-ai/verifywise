/**
 * Phase 2 — Approval Gateway
 *
 * Main orchestrator that receives tool execution requests, runs them through
 * the XState state machine, persists state to the database, and coordinates
 * with Redis for fast frontend polling.
 */

import { isAutoRejectable, evaluateRules, deriveFacts } from "./rules";
import type { RuleDecision } from "./ruleEngine";
import { storeConfirmation, resolveConfirmation } from "../confirmation/confirmationStore";
import { writeToolExecutors } from "../confirmation/createWriteTool";
import type { ConfirmationRequest, ConfirmationToolResult } from "../confirmation/types";
import type { SubmitForApprovalConfig, ApprovalContext, StateHistoryEntry } from "./types";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { logStructured } from "../../utils/logger/fileLogger";
import { createNotificationQuery } from "../../utils/notification.utils";
import {
  NotificationType,
  NotificationEntityType,
} from "../../domain.layer/interfaces/i.notification";
import { logStateHistory } from "../../services/aiAuditTrail.service";

const fileName = "approvalGateway.ts";

/**
 * Marker error: the executor cannot run RIGHT NOW because some external
 * precondition isn't met yet (e.g. the suggested-risk's parent model
 * approval is still pending). This is a RETRYABLE failure — the gateway
 * keeps the approval in `pending_approval` state instead of marking it
 * `failed`, so the user can try Approve again once the precondition
 * holds.
 *
 * Distinct from a permanent failure (bad data, schema drift, runtime
 * exception in the executor) which should land in `failed` state.
 */
export class TransientApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientApprovalError";
  }
}

// ── Result types ────────────────────────────────────────────────

export interface ApprovalSubmitResult {
  /** "pending" if human approval needed, "completed" if auto-approved, "rejected" if auto-rejected */
  outcome: "pending" | "completed" | "rejected";
  /** The approval record id */
  approvalId: string;
  /** If outcome=pending, the confirmation payload for the LLM */
  confirmationResult?: ConfirmationToolResult;
  /** If outcome=completed (auto-approved), the execution result */
  executionResult?: unknown;
  /** If outcome=rejected, the error message */
  errorMessage?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function deriveActionType(toolName: string): string {
  if (toolName.includes("delete") || toolName.includes("remove")) return "delete";
  if (toolName.includes("archive")) return "archive";
  if (toolName.includes("create") || toolName.includes("register") || toolName.includes("add"))
    return "create";
  return "update";
}

async function insertApprovalRecord(
  id: string,
  config: SubmitForApprovalConfig,
  state: string,
  stateHistory: StateHistoryEntry[],
  extra?: {
    ruleMatched?: string;
    result?: unknown;
    errorMessage?: string;
    approvedBy?: number;
    approvedAt?: string;
    executedAt?: string;
  },
): Promise<void> {
  await sequelize.query(
    `INSERT INTO ai_action_approvals
      (id, organization_id, action_type, tool_name, input_params, risk_level, state,
       rule_matched, requested_by, approved_by, approved_at, executed_at,
       result, error_message, state_history, created_at, updated_at)
     VALUES
      (:id, :organizationId, :actionType, :toolName, :inputParams, :riskLevel, :state,
       :ruleMatched, :requestedBy, :approvedBy, :approvedAt, :executedAt,
       :result, :errorMessage, :stateHistory, NOW(), NOW())`,
    {
      replacements: {
        id,
        organizationId: config.organizationId,
        actionType: deriveActionType(config.toolName),
        toolName: config.toolName,
        inputParams: JSON.stringify(config.inputParams),
        riskLevel: config.riskLevel,
        state,
        ruleMatched: extra?.ruleMatched || null,
        requestedBy: config.userId,
        approvedBy: extra?.approvedBy || null,
        approvedAt: extra?.approvedAt || null,
        executedAt: extra?.executedAt || null,
        result: extra?.result ? JSON.stringify(extra.result) : null,
        errorMessage: extra?.errorMessage || null,
        stateHistory: JSON.stringify(stateHistory),
      },
      type: QueryTypes.INSERT,
    },
  );
}

async function updateApprovalRecord(
  id: string,
  organizationId: number,
  updates: Record<string, unknown>,
): Promise<void> {
  const setClauses: string[] = ["updated_at = NOW()"];
  const replacements: Record<string, unknown> = { id, organizationId };

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
    setClauses.push(`${snakeKey} = :${key}`);
    if (typeof value === "object" && value !== null) {
      replacements[key] = JSON.stringify(value);
    } else {
      replacements[key] = value;
    }
  }

  await sequelize.query(
    `UPDATE ai_action_approvals SET ${setClauses.join(", ")}
     WHERE id = :id AND organization_id = :organizationId`,
    { replacements, type: QueryTypes.UPDATE },
  );
}

// ── Core Gateway ────────────────────────────────────────────────

/**
 * Submit a write tool operation for approval.
 * Uses the rule engine to evaluate, then routes through XState machine.
 */
export async function submitForApproval(
  config: SubmitForApprovalConfig,
): Promise<ApprovalSubmitResult> {
  const functionName = "submitForApproval";
  const id = uuidv4();

  // Pre-check: does this tool have an executor?
  const noExecutor = isAutoRejectable({
    riskLevel: config.riskLevel,
    toolName: config.toolName,
  } as ApprovalContext);

  // Run the rule engine for a richer evaluation
  let ruleDecision: RuleDecision = "require-approval";
  let ruleMatched: string | undefined;

  if (!noExecutor) {
    try {
      const facts = deriveFacts({
        toolName: config.toolName,
        riskLevel: config.riskLevel,
        inputParams: config.inputParams,
      });
      const ruleResult = await evaluateRules(config.organizationId, facts);
      ruleDecision = ruleResult.decision;
      ruleMatched = ruleResult.matchedRule || undefined;
    } catch {
      // Rule engine failure → safe default: require approval
      logStructured(
        "error",
        "rule engine failed, defaulting to require-approval",
        functionName,
        fileName,
      );
    }
  }

  // Build state history
  const stateHistory: StateHistoryEntry[] = [
    { state: "idle", timestamp: new Date().toISOString(), actor: "system" },
    {
      state: "evaluate",
      timestamp: new Date().toISOString(),
      actor: "system",
      reason: "evaluating rules",
    },
  ];

  // Determine the effective decision
  let effectiveDecision: "auto-approve" | "require-approval" | "auto-reject";
  let effectiveRuleMatched: string | undefined;

  if (noExecutor) {
    effectiveDecision = "auto-reject";
    effectiveRuleMatched = "no_executor";
  } else if (ruleDecision === "auto-reject") {
    effectiveDecision = "auto-reject";
    effectiveRuleMatched = ruleMatched || "auto_reject_rule";
  } else if (ruleDecision === "auto-approve") {
    effectiveDecision = "auto-approve";
    effectiveRuleMatched = ruleMatched || `auto_approve:risk_level=${config.riskLevel}`;
  } else {
    effectiveDecision = "require-approval";
    effectiveRuleMatched = ruleMatched;
  }

  stateHistory.push({
    state:
      effectiveDecision === "auto-reject"
        ? "auto_reject"
        : effectiveDecision === "auto-approve"
          ? "auto_approve"
          : "pending_approval",
    timestamp: new Date().toISOString(),
    actor: "system",
    reason: effectiveRuleMatched || effectiveDecision,
  });

  // ── Handle each path ──

  if (effectiveDecision === "auto-reject") {
    const errorMessage = noExecutor
      ? `No executor registered for tool: ${config.toolName}`
      : `Auto-rejected by rule: ${effectiveRuleMatched}`;
    await insertApprovalRecord(id, config, "auto_reject", stateHistory, {
      ruleMatched: effectiveRuleMatched,
      errorMessage,
    });
    logStructured(
      "successful",
      `auto-rejected ${config.toolName}: ${errorMessage}`,
      functionName,
      fileName,
    );
    logStateHistory(config.organizationId, id, stateHistory, config.toolName).catch(() => {});
    return {
      outcome: "rejected",
      approvalId: id,
      errorMessage,
    };
  }

  if (effectiveDecision === "auto-approve") {
    // Auto-approved — execute immediately
    stateHistory.push({ state: "executing", timestamp: new Date().toISOString(), actor: "system" });

    const executor = writeToolExecutors.get(config.toolName);
    if (!executor) {
      stateHistory.push({
        state: "failed",
        timestamp: new Date().toISOString(),
        actor: "system",
        reason: "no executor",
      });
      await insertApprovalRecord(id, config, "failed", stateHistory, {
        ruleMatched: effectiveRuleMatched,
        errorMessage: "Executor disappeared after auto-approve",
      });
      return { outcome: "rejected", approvalId: id, errorMessage: "Executor not found" };
    }

    let result: unknown;
    try {
      const paramsWithUser = { ...config.inputParams, _userId: config.userId };
      result = await executor(paramsWithUser, config.organizationId);
    } catch (execError) {
      const errorMsg = execError instanceof Error ? execError.message : "Unknown error";
      stateHistory.push({
        state: "failed",
        timestamp: new Date().toISOString(),
        actor: "system",
        reason: errorMsg,
      });
      await insertApprovalRecord(id, config, "failed", stateHistory, {
        ruleMatched: effectiveRuleMatched,
        errorMessage: errorMsg,
        executedAt: new Date().toISOString(),
      });
      logStructured("error", `auto-approve execution failed: ${errorMsg}`, functionName, fileName);
      return { outcome: "rejected", approvalId: id, errorMessage: errorMsg };
    }

    stateHistory.push({
      state: "completed",
      timestamp: new Date().toISOString(),
      actor: "system",
      reason: "execution succeeded",
    });
    await insertApprovalRecord(id, config, "completed", stateHistory, {
      ruleMatched: effectiveRuleMatched,
      result,
      approvedBy: config.userId,
      approvedAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
    });
    logStructured(
      "successful",
      `auto-approved and executed ${config.toolName}`,
      functionName,
      fileName,
    );
    logStateHistory(config.organizationId, id, stateHistory, config.toolName).catch(() => {});
    return { outcome: "completed", approvalId: id, executionResult: result };
  }

  // effectiveDecision === "require-approval"
  {
    // Persist to DB
    await insertApprovalRecord(id, config, "pending_approval", stateHistory);

    // Also write to Redis for fast frontend polling (backward compat)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const redisRequest: ConfirmationRequest = {
      id,
      organizationId: config.organizationId,
      userId: config.userId,
      toolName: config.toolName,
      warningLevel: config.riskLevel,
      description: config.description,
      params: config.inputParams,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    try {
      await storeConfirmation(redisRequest);
    } catch (redisError) {
      logStructured(
        "error",
        `Redis store failed (non-fatal): ${redisError}`,
        functionName,
        fileName,
      );
    }

    // Bridge: Create approval_request for the existing workflow system (non-fatal)
    try {
      await bridgeToApprovalWorkflow(id, config);
    } catch (bridgeError) {
      logStructured(
        "error",
        `approval workflow bridge failed (non-fatal): ${bridgeError}`,
        functionName,
        fileName,
      );
    }

    // Send notification to admins (non-fatal)
    try {
      await notifyPendingApproval(config);
    } catch (notifyError) {
      logStructured(
        "error",
        `notification failed (non-fatal): ${notifyError}`,
        functionName,
        fileName,
      );
    }

    const confirmationResult: ConfirmationToolResult = {
      confirmation_required: true,
      confirmation_id: id,
      warning_level: config.riskLevel,
      description: config.description,
      tool_name: config.toolName,
      params_summary: config.inputParams,
    };

    logStructured("successful", `pending approval for ${config.toolName}`, functionName, fileName);
    logStateHistory(config.organizationId, id, stateHistory, config.toolName).catch(() => {});
    return { outcome: "pending", approvalId: id, confirmationResult };
  }
}

// ── Approve / Reject Actions ────────────────────────────────────

/**
 * Approve a pending approval and execute the write operation.
 */
export async function approveAction(
  organizationId: number,
  id: string,
  userId: number,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const functionName = "approveAction";

  // Read from DB
  const records = (await sequelize.query(
    `SELECT * FROM ai_action_approvals
     WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  const record = records[0];

  if (!record) {
    return { success: false, error: "Approval not found" };
  }
  if (record.state !== "pending_approval") {
    return { success: false, error: `Approval already ${record.state}` };
  }

  const stateHistory: StateHistoryEntry[] =
    typeof record.state_history === "string"
      ? JSON.parse(record.state_history)
      : record.state_history || [];

  // Look up executor
  const executor = writeToolExecutors.get(record.tool_name);
  if (!executor) {
    stateHistory.push({
      state: "failed",
      timestamp: new Date().toISOString(),
      actor: "system",
      reason: "no executor",
    });
    await updateApprovalRecord(id, organizationId, {
      state: "failed",
      stateHistory,
      errorMessage: `No executor for ${record.tool_name}`,
    });
    return { success: false, error: `No executor for ${record.tool_name}` };
  }

  // Transition: pending_approval → approved → executing
  stateHistory.push({
    state: "approved",
    timestamp: new Date().toISOString(),
    actor: `user:${userId}`,
  });
  stateHistory.push({ state: "executing", timestamp: new Date().toISOString(), actor: "system" });
  await updateApprovalRecord(id, organizationId, {
    state: "executing",
    stateHistory,
    approvedBy: userId,
    approvedAt: new Date().toISOString(),
  });

  // Execute — re-inject _userId so executors that need author_id/created_by can use it
  const inputParams =
    typeof record.input_params === "string" ? JSON.parse(record.input_params) : record.input_params;
  inputParams._userId = userId;

  let result: unknown;
  try {
    result = await executor(inputParams, organizationId);
  } catch (execError) {
    const errorMsg = execError instanceof Error ? execError.message : "Unknown error";

    // TransientApprovalError → keep the approval retryable. Don't mark
    // it `failed`; revert state back to `pending_approval` so the user
    // can click Approve again once the precondition holds. This is the
    // suggested-risk-before-model-approval flow: the user clicks Approve
    // on a risk while the parent model is still pending; we surface the
    // error but leave the card in its pending state for retry.
    if (execError instanceof TransientApprovalError) {
      stateHistory.push({
        state: "pending_approval",
        timestamp: new Date().toISOString(),
        actor: "system",
        reason: `transient: ${errorMsg}`,
      });
      await updateApprovalRecord(id, organizationId, {
        state: "pending_approval",
        stateHistory,
        errorMessage: errorMsg,
        // Intentionally NOT setting executedAt — execution didn't run.
      });
      logStateHistory(organizationId, id, stateHistory, record.tool_name).catch(() => {});
      logStructured(
        "processing",
        `transient failure on ${record.tool_name}; kept as pending_approval for retry: ${errorMsg}`,
        functionName,
        fileName,
      );
      return { success: false, error: errorMsg };
    }

    stateHistory.push({
      state: "failed",
      timestamp: new Date().toISOString(),
      actor: "system",
      reason: errorMsg,
    });
    await updateApprovalRecord(id, organizationId, {
      state: "failed",
      stateHistory,
      errorMessage: errorMsg,
      executedAt: new Date().toISOString(),
    });

    // Also resolve in Redis for backward compat
    try {
      await resolveConfirmation(organizationId, id, "rejected", userId, undefined, errorMsg);
    } catch {
      /* non-fatal */
    }

    logStateHistory(organizationId, id, stateHistory, record.tool_name).catch(() => {});
    logStructured("error", `execution failed after approval: ${errorMsg}`, functionName, fileName);
    return { success: false, error: errorMsg };
  }

  // Transition: executing → completed
  stateHistory.push({
    state: "completed",
    timestamp: new Date().toISOString(),
    actor: "system",
    reason: "execution succeeded",
  });
  await updateApprovalRecord(id, organizationId, {
    state: "completed",
    stateHistory,
    result,
    executedAt: new Date().toISOString(),
  });

  // Also resolve in Redis
  try {
    await resolveConfirmation(organizationId, id, "approved", userId, result);
  } catch {
    /* non-fatal */
  }

  // Log audit trail for approve + execute + complete
  logStateHistory(organizationId, id, stateHistory, record.tool_name).catch(() => {});

  logStructured("successful", `approved and executed ${record.tool_name}`, functionName, fileName);
  return { success: true, result };
}

/**
 * Reject a pending approval.
 */
export async function rejectAction(
  organizationId: number,
  id: string,
  userId: number,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const functionName = "rejectAction";

  const records = (await sequelize.query(
    `SELECT * FROM ai_action_approvals
     WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  const record = records[0];
  if (!record) {
    return { success: false, error: "Approval not found" };
  }
  if (record.state !== "pending_approval") {
    return { success: false, error: `Approval already ${record.state}` };
  }

  const stateHistory: StateHistoryEntry[] =
    typeof record.state_history === "string"
      ? JSON.parse(record.state_history)
      : record.state_history || [];

  stateHistory.push({
    state: "rejected",
    timestamp: new Date().toISOString(),
    actor: `user:${userId}`,
    reason: reason || "human rejected",
  });

  await updateApprovalRecord(id, organizationId, {
    state: "rejected",
    stateHistory,
  });

  // Also resolve in Redis
  try {
    await resolveConfirmation(organizationId, id, "rejected", userId);
  } catch {
    /* non-fatal */
  }

  logStateHistory(organizationId, id, stateHistory, record.tool_name).catch(() => {});
  logStructured("successful", `rejected ${record.tool_name}`, functionName, fileName);
  return { success: true };
}

// ── Query Functions ─────────────────────────────────────────────

/**
 * Get a single approval record.
 */
export async function getApproval(
  organizationId: number,
  id: string,
): Promise<Record<string, unknown> | null> {
  const records = (await sequelize.query(
    `SELECT * FROM ai_action_approvals
     WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  return records[0] || null;
}

/**
 * List approval records with optional filters.
 */
export async function listApprovals(
  organizationId: number,
  filters?: {
    state?: string;
    toolName?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const conditions = ["organization_id = :organizationId"];
  const replacements: Record<string, unknown> = { organizationId };

  if (filters?.state) {
    conditions.push("state = :state");
    replacements.state = filters.state;
  }
  if (filters?.toolName) {
    conditions.push("tool_name = :toolName");
    replacements.toolName = filters.toolName;
  }
  if (filters?.dateFrom) {
    conditions.push("created_at >= :dateFrom");
    replacements.dateFrom = filters.dateFrom;
  }
  if (filters?.dateTo) {
    conditions.push("created_at <= :dateTo");
    replacements.dateTo = filters.dateTo;
  }

  const where = conditions.join(" AND ");
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const rows = (await sequelize.query(
    `SELECT * FROM ai_action_approvals WHERE ${where}
     ORDER BY created_at DESC LIMIT :limit OFFSET :offset`,
    { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT },
  )) as any[];

  const countResult = (await sequelize.query(
    `SELECT COUNT(*) as total FROM ai_action_approvals WHERE ${where}`,
    { replacements, type: QueryTypes.SELECT },
  )) as any[];

  return { rows, total: Number(countResult[0]?.total || 0) };
}

/**
 * Get approval statistics for an organization.
 */
export async function getApprovalStats(organizationId: number): Promise<Record<string, unknown>> {
  const [stats] = (await sequelize.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE state = 'completed' AND rule_matched LIKE 'auto_approve%') as auto_approved,
       COUNT(*) FILTER (WHERE state = 'completed' AND rule_matched IS NULL OR rule_matched NOT LIKE 'auto_approve%') as human_approved,
       COUNT(*) FILTER (WHERE state = 'rejected') as rejected,
       COUNT(*) FILTER (WHERE state IN ('auto_reject', 'failed')) as auto_rejected,
       COUNT(*) FILTER (WHERE state = 'pending_approval') as pending,
       ROUND(
         AVG(EXTRACT(EPOCH FROM (approved_at - created_at)))
         FILTER (WHERE approved_at IS NOT NULL), 2
       ) as avg_wait_seconds,
       ROUND(
         100.0 * COUNT(*) FILTER (WHERE state = 'completed' AND rule_matched LIKE 'auto_approve%')
         / NULLIF(COUNT(*), 0), 2
       ) as auto_approve_pct,
       ROUND(
         100.0 * COUNT(*) FILTER (WHERE state = 'rejected')
         / NULLIF(COUNT(*), 0), 2
       ) as rejection_rate_pct
     FROM ai_action_approvals
     WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  return stats || {};
}

// ── Bridge & Notification Helpers ───────────────────────────────

/**
 * Bridge an AI action to the existing approval_requests workflow system.
 * Finds the default ai_action workflow for the org, creates an approval_request,
 * and links it back to the ai_action_approvals record.
 */
async function bridgeToApprovalWorkflow(
  aiApprovalId: string,
  config: SubmitForApprovalConfig,
): Promise<void> {
  // Find the default ai_action workflow for this organization
  const workflows = (await sequelize.query(
    `SELECT id FROM approval_workflows
     WHERE organization_id = :organizationId
       AND entity_type = 'ai_action'
       AND is_active = true
     LIMIT 1`,
    { replacements: { organizationId: config.organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  if (!workflows[0]) {
    // No ai_action workflow configured — skip bridging
    return;
  }

  const workflowId = workflows[0].id;

  // Create the approval request
  const requests = (await sequelize.query(
    `INSERT INTO approval_requests
      (organization_id, request_name, workflow_id, entity_id, entity_type, entity_data, status, requested_by, current_step, created_at, updated_at)
     VALUES
      (:organizationId, :requestName, :workflowId, NULL, 'ai_action',
       :entityData, 'Pending', :requestedBy, 1, NOW(), NOW())
     RETURNING id`,
    {
      replacements: {
        organizationId: config.organizationId,
        requestName: `AI Action: ${config.description}`,
        workflowId,
        entityData: JSON.stringify({
          ai_approval_id: aiApprovalId,
          tool_name: config.toolName,
          risk_level: config.riskLevel,
          description: config.description,
          action_type: config.actionType,
        }),
        requestedBy: config.userId,
      },
      type: QueryTypes.INSERT,
    },
  )) as any;

  const approvalRequestId = requests?.[0]?.[0]?.id || requests?.[0]?.id;
  if (!approvalRequestId) return;

  // Link back to ai_action_approvals
  await updateApprovalRecord(aiApprovalId, config.organizationId, {
    approvalRequestId,
  });

  // Create the first step from the workflow
  const steps = (await sequelize.query(
    `SELECT * FROM approval_workflow_steps
     WHERE workflow_id = :workflowId AND organization_id = :organizationId
     ORDER BY step_number ASC`,
    {
      replacements: { workflowId, organizationId: config.organizationId },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  for (const step of steps) {
    await sequelize.query(
      `INSERT INTO approval_request_steps
        (organization_id, request_id, step_number, step_name, status, date_assigned, created_at)
       VALUES (:organizationId, :requestId, :stepNumber, :stepName, 'Pending', NOW(), NOW())`,
      {
        replacements: {
          organizationId: config.organizationId,
          requestId: approvalRequestId,
          stepNumber: step.step_number,
          stepName: step.step_name,
        },
        type: QueryTypes.INSERT,
      },
    );
  }
}

/**
 * Send notification to admins when an AI action enters pending_approval.
 */
async function notifyPendingApproval(config: SubmitForApprovalConfig): Promise<void> {
  // Find admin users for this organization
  const admins = (await sequelize.query(
    `SELECT u.id FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.organization_id = :organizationId
       AND r.name = 'Admin'`,
    { replacements: { organizationId: config.organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  for (const admin of admins) {
    await createNotificationQuery(
      {
        user_id: admin.id,
        type: NotificationType.APPROVAL_REQUESTED,
        title: "AI Action Needs Approval",
        message: `${config.description} (${config.riskLevel} risk)`,
        entity_type: NotificationEntityType.AI_ACTION,
        entity_id: 0,
        entity_name: config.toolName,
        action_url: "/settings/ai-approval-rules",
        created_by: config.userId,
      },
      config.organizationId,
    );
  }
}
