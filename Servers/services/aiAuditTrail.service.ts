/**
 * AI Action Audit Trail Service
 *
 * Records every state transition from the XState approval machine.
 * Required for EU AI Act Article 12 compliance.
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { logStructured } from "../utils/logger/fileLogger";

const fileName = "aiAuditTrail.service.ts";

interface TransitionLog {
  organizationId: number;
  actionApprovalId: string;
  fromState: string | null;
  toState: string;
  actorType: "user" | "system" | "rule_engine";
  actorId?: number;
  ruleName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a single state transition.
 */
export async function logTransition(log: TransitionLog): Promise<void> {
  try {
    await sequelize.query(
      `INSERT INTO ai_action_audit_log
        (organization_id, action_approval_id, from_state, to_state, actor_type, actor_id, rule_name, metadata, created_at)
       VALUES
        (:organizationId, :actionApprovalId, :fromState, :toState, :actorType, :actorId, :ruleName, :metadata, NOW())`,
      {
        replacements: {
          organizationId: log.organizationId,
          actionApprovalId: log.actionApprovalId,
          fromState: log.fromState || null,
          toState: log.toState,
          actorType: log.actorType,
          actorId: log.actorId || null,
          ruleName: log.ruleName || null,
          metadata: JSON.stringify(log.metadata || {}),
        },
        type: QueryTypes.INSERT,
      },
    );
  } catch (error) {
    // Non-fatal — don't break the approval flow for audit failures
    logStructured("error", `audit log failed: ${error}`, "logTransition", fileName);
  }
}

/**
 * Log multiple transitions from a state history array (batch).
 */
export async function logStateHistory(
  organizationId: number,
  actionApprovalId: string,
  stateHistory: Array<{ state: string; timestamp: string; actor?: string; reason?: string }>,
  toolName?: string,
): Promise<void> {
  for (let i = 0; i < stateHistory.length; i++) {
    const entry = stateHistory[i];
    const fromState = i > 0 ? stateHistory[i - 1].state : null;
    const actorType = entry.actor?.startsWith("user:")
      ? ("user" as const)
      : entry.actor === "rule_engine"
        ? ("rule_engine" as const)
        : ("system" as const);
    const actorId = entry.actor?.startsWith("user:")
      ? parseInt(entry.actor.split(":")[1], 10)
      : undefined;

    await logTransition({
      organizationId,
      actionApprovalId,
      fromState,
      toState: entry.state,
      actorType,
      actorId,
      metadata: {
        reason: entry.reason,
        timestamp: entry.timestamp,
        tool_name: toolName,
      },
    });
  }
}

/**
 * Get full audit trail for a single action.
 */
export async function getActionAuditLog(
  organizationId: number,
  actionApprovalId: string,
): Promise<Record<string, unknown>[]> {
  return (await sequelize.query(
    `SELECT * FROM ai_action_audit_log
     WHERE organization_id = :organizationId AND action_approval_id = :actionApprovalId
     ORDER BY created_at ASC`,
    { replacements: { organizationId, actionApprovalId }, type: QueryTypes.SELECT },
  )) as any[];
}

/**
 * Get paginated audit log with filters.
 */
export async function getAuditLogPaginated(
  organizationId: number,
  filters?: {
    state?: string;
    toolName?: string;
    userId?: number;
    actorType?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const conditions = ["al.organization_id = :organizationId"];
  const replacements: Record<string, unknown> = { organizationId };

  if (filters?.state) {
    conditions.push("al.to_state = :state");
    replacements.state = filters.state;
  }
  if (filters?.toolName) {
    conditions.push("aa.tool_name = :toolName");
    replacements.toolName = filters.toolName;
  }
  if (filters?.userId) {
    conditions.push("al.actor_id = :userId");
    replacements.userId = filters.userId;
  }
  if (filters?.actorType) {
    conditions.push("al.actor_type = :actorType");
    replacements.actorType = filters.actorType;
  }
  if (filters?.dateFrom) {
    conditions.push("al.created_at >= :dateFrom");
    replacements.dateFrom = filters.dateFrom;
  }
  if (filters?.dateTo) {
    conditions.push("al.created_at <= :dateTo");
    replacements.dateTo = filters.dateTo;
  }

  const where = conditions.join(" AND ");
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const rows = (await sequelize.query(
    `SELECT al.*, aa.tool_name, aa.risk_level, aa.action_type, aa.state as action_state,
            u.name as actor_name, u.surname as actor_surname
     FROM ai_action_audit_log al
     LEFT JOIN ai_action_approvals aa ON al.action_approval_id = aa.id
     LEFT JOIN users u ON al.actor_id = u.id
     WHERE ${where}
     ORDER BY al.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT },
  )) as any[];

  const countResult = (await sequelize.query(
    `SELECT COUNT(*) as total
     FROM ai_action_audit_log al
     LEFT JOIN ai_action_approvals aa ON al.action_approval_id = aa.id
     WHERE ${where}`,
    { replacements, type: QueryTypes.SELECT },
  )) as any[];

  return { rows, total: Number(countResult[0]?.total || 0) };
}
