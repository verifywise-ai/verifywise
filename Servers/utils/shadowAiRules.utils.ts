/**
 * Shadow AI Rules Utils
 *
 * Database queries for managing Shadow AI rules and alert history.
 */

import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import {
  IShadowAiRule,
  IShadowAiAlertHistory,
} from "../domain.layer/interfaces/i.shadowAi";

/**
 * Safely parse a JSON string, returning a fallback value on failure.
 */
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Get all active rules for an organization.
 */
export async function getActiveRulesQuery(
  organizationId: number
): Promise<IShadowAiRule[]> {
  const [rows] = await sequelize.query(
    `SELECT r.*,
       COALESCE(
         (SELECT json_agg(rn.user_id)
          FROM shadow_ai_rule_notifications rn
          WHERE rn.organization_id = r.organization_id AND rn.rule_id = r.id),
         '[]'
       ) as notification_user_ids
     FROM shadow_ai_rules r
     WHERE r.organization_id = :organizationId AND r.is_active = true
     ORDER BY r.created_at DESC`,
    { replacements: { organizationId } }
  );

  return (rows as any[]).map((r) => ({
    ...r,
    actions: safeJsonParse(r.actions, []),
    trigger_config: safeJsonParse(r.trigger_config, {}),
    notification_user_ids: safeJsonParse(r.notification_user_ids, []),
  }));
}

/**
 * Get all rules for an organization.
 */
export async function getAllRulesQuery(
  organizationId: number
): Promise<IShadowAiRule[]> {
  const [rows] = await sequelize.query(
    `SELECT r.*,
       COALESCE(
         (SELECT json_agg(rn.user_id)
          FROM shadow_ai_rule_notifications rn
          WHERE rn.organization_id = r.organization_id AND rn.rule_id = r.id),
         '[]'
       ) as notification_user_ids
     FROM shadow_ai_rules r
     WHERE r.organization_id = :organizationId
     ORDER BY r.created_at DESC`,
    { replacements: { organizationId } }
  );

  return (rows as any[]).map((r) => ({
    ...r,
    actions: safeJsonParse(r.actions, []),
    trigger_config: safeJsonParse(r.trigger_config, {}),
    notification_user_ids: safeJsonParse(r.notification_user_ids, []),
  }));
}

/**
 * Create a new rule.
 */
export async function createRuleQuery(
  organizationId: number,
  rule: {
    name: string;
    description?: string;
    is_active: boolean;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    actions: Array<{ type: string; assign_to?: number }>;
    cooldown_minutes?: number;
    created_by: number;
    notification_user_ids?: number[];
  },
  transaction?: Transaction
): Promise<IShadowAiRule> {
  const [result] = await sequelize.query(
    `INSERT INTO shadow_ai_rules
       (organization_id, name, description, is_active, trigger_type, trigger_config, actions, cooldown_minutes, created_by)
     VALUES
       (:organizationId, :name, :description, :is_active, :trigger_type, :trigger_config, :actions, :cooldown_minutes, :created_by)
     RETURNING *`,
    {
      replacements: {
        organizationId,
        name: rule.name,
        description: rule.description || null,
        is_active: rule.is_active,
        trigger_type: rule.trigger_type,
        trigger_config: JSON.stringify(rule.trigger_config),
        actions: JSON.stringify(rule.actions),
        cooldown_minutes: rule.cooldown_minutes ?? 1440,
        created_by: rule.created_by,
      },
      ...(transaction ? { transaction } : {}),
    }
  );

  const created = (result as any[])[0];

  // Insert notification recipients
  if (rule.notification_user_ids && rule.notification_user_ids.length > 0) {
    for (const userId of rule.notification_user_ids) {
      await sequelize.query(
        `INSERT INTO shadow_ai_rule_notifications (organization_id, rule_id, user_id)
         VALUES (:organizationId, :ruleId, :userId)
         ON CONFLICT (organization_id, rule_id, user_id) DO NOTHING`,
        {
          replacements: { organizationId, ruleId: created.id, userId },
          ...(transaction ? { transaction } : {}),
        }
      );
    }
  }

  return {
    ...created,
    actions: safeJsonParse(created.actions, []),
    trigger_config: safeJsonParse(created.trigger_config, {}),
    notification_user_ids: rule.notification_user_ids || [],
  };
}

/**
 * Update a rule.
 */
export async function updateRuleQuery(
  organizationId: number,
  ruleId: number,
  updates: {
    name?: string;
    description?: string;
    is_active?: boolean;
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
    actions?: Array<{ type: string; assign_to?: number }>;
    cooldown_minutes?: number;
    notification_user_ids?: number[];
  },
  transaction?: Transaction
): Promise<IShadowAiRule | null> {
  // Build SET clause dynamically
  const setClauses: string[] = ["updated_at = NOW()"];
  const replacements: Record<string, any> = { organizationId, ruleId };

  if (updates.name !== undefined) {
    setClauses.push("name = :name");
    replacements.name = updates.name;
  }
  if (updates.description !== undefined) {
    setClauses.push("description = :description");
    replacements.description = updates.description;
  }
  if (updates.is_active !== undefined) {
    setClauses.push("is_active = :is_active");
    replacements.is_active = updates.is_active;
  }
  if (updates.trigger_type !== undefined) {
    setClauses.push("trigger_type = :trigger_type");
    replacements.trigger_type = updates.trigger_type;
  }
  if (updates.trigger_config !== undefined) {
    setClauses.push("trigger_config = :trigger_config");
    replacements.trigger_config = JSON.stringify(updates.trigger_config);
  }
  if (updates.actions !== undefined) {
    setClauses.push("actions = :actions");
    replacements.actions = JSON.stringify(updates.actions);
  }
  if (updates.cooldown_minutes !== undefined) {
    setClauses.push("cooldown_minutes = :cooldown_minutes");
    replacements.cooldown_minutes = updates.cooldown_minutes;
  }

  const [rows] = await sequelize.query(
    `UPDATE shadow_ai_rules
     SET ${setClauses.join(", ")}
     WHERE organization_id = :organizationId AND id = :ruleId
     RETURNING *`,
    {
      replacements,
      ...(transaction ? { transaction } : {}),
    }
  );

  const results = rows as any[];
  if (results.length === 0) return null;

  // Update notification recipients if provided
  if (updates.notification_user_ids !== undefined) {
    await sequelize.query(
      `DELETE FROM shadow_ai_rule_notifications WHERE organization_id = :organizationId AND rule_id = :ruleId`,
      {
        replacements: { organizationId, ruleId },
        ...(transaction ? { transaction } : {}),
      }
    );

    for (const userId of updates.notification_user_ids) {
      await sequelize.query(
        `INSERT INTO shadow_ai_rule_notifications (organization_id, rule_id, user_id)
         VALUES (:organizationId, :ruleId, :userId)
         ON CONFLICT (organization_id, rule_id, user_id) DO NOTHING`,
        {
          replacements: { organizationId, ruleId, userId },
          ...(transaction ? { transaction } : {}),
        }
      );
    }
  }

  const r = results[0];
  return {
    ...r,
    actions: safeJsonParse(r.actions, []),
    trigger_config: safeJsonParse(r.trigger_config, {}),
    notification_user_ids: updates.notification_user_ids || [],
  };
}

/**
 * Delete a rule and its notification recipients.
 */
export async function deleteRuleQuery(
  organizationId: number,
  ruleId: number,
  transaction?: Transaction
): Promise<boolean> {
  const [rows] = await sequelize.query(
    `DELETE FROM shadow_ai_rules WHERE organization_id = :organizationId AND id = :ruleId RETURNING id`,
    {
      replacements: { organizationId, ruleId },
      ...(transaction ? { transaction } : {}),
    }
  );

  return (rows as any[]).length > 0;
}

/**
 * Get alert history with optional filtering.
 */
export async function getAlertHistoryQuery(
  organizationId: number,
  options?: {
    page?: number;
    limit?: number;
    ruleId?: number;
  }
): Promise<{ alerts: IShadowAiAlertHistory[]; total: number }> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const whereConditions: string[] = ["organization_id = :organizationId"];
  const replacements: Record<string, any> = { organizationId, limit, offset };

  if (options?.ruleId) {
    whereConditions.push("rule_id = :ruleId");
    replacements.ruleId = options.ruleId;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_alert_history
     ${whereClause}
     ORDER BY fired_at DESC
     LIMIT :limit OFFSET :offset`,
    { replacements }
  );

  const [countResult] = await sequelize.query(
    `SELECT COUNT(*) as total FROM shadow_ai_alert_history ${whereClause}`,
    { replacements }
  );

  return {
    alerts: (rows as any[]).map((r) => ({
      ...r,
      trigger_data: safeJsonParse(r.trigger_data, {}),
      actions_taken: safeJsonParse(r.actions_taken, {}),
    })),
    total: parseInt((countResult as any[])[0].total, 10),
  };
}

/**
 * Get recent alert keys for cooldown checks.
 * Returns a Set of "ruleId:keyType:keyValue" strings for alerts
 * that fired within each rule's cooldown window.
 *
 * Uses a single batch query to avoid N+1 lookups.
 */
export async function getRecentAlertKeys(
  organizationId: number,
  rules: Array<{ id: number; cooldown_minutes: number }>
): Promise<Set<string>> {
  const result = new Set<string>();
  if (rules.length === 0) return result;

  // Find the maximum cooldown window to limit the query range
  const maxCooldown = Math.max(...rules.map((r) => r.cooldown_minutes));
  const ruleIds = rules.map((r) => r.id);

  // Build a cooldown map for per-rule filtering
  const cooldownMap = new Map<number, number>();
  for (const r of rules) {
    cooldownMap.set(r.id, r.cooldown_minutes);
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT rule_id, trigger_data, fired_at
       FROM shadow_ai_alert_history
       WHERE organization_id = :organizationId
         AND rule_id IN (:ruleIds)
         AND fired_at > NOW() - INTERVAL '1 minute' * :maxCooldown`,
      { replacements: { organizationId, ruleIds, maxCooldown } }
    );

    for (const row of rows as any[]) {
      const ruleId = row.rule_id;
      const cooldownMinutes = cooldownMap.get(ruleId);
      if (cooldownMinutes === undefined) continue;

      // Check if this specific alert is within its rule's cooldown
      const firedAt = new Date(row.fired_at);
      const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);
      if (firedAt < cutoff) continue;

      const data = safeJsonParse<Record<string, unknown>>(row.trigger_data, {});

      // Build dedup keys based on what context data is present
      if (data.tool_id != null) {
        result.add(`${ruleId}:tool:${data.tool_id}`);
      }
      if (data.user_email) {
        result.add(`${ruleId}:email:${data.user_email}`);
      }
      if (data.department) {
        result.add(`${ruleId}:dept:${data.department}`);
      }
    }
  } catch {
    // If query fails (table doesn't exist yet), return empty set
  }

  return result;
}

/**
 * Insert an alert history record.
 */
export async function insertAlertHistoryQuery(
  organizationId: number,
  alert: {
    rule_id: number;
    rule_name: string;
    trigger_type: string;
    trigger_data: Record<string, unknown>;
    actions_taken: Record<string, unknown>;
  },
  transaction?: Transaction
): Promise<void> {
  await sequelize.query(
    `INSERT INTO shadow_ai_alert_history
       (organization_id, rule_id, rule_name, trigger_type, trigger_data, actions_taken)
     VALUES
       (:organizationId, :rule_id, :rule_name, :trigger_type, :trigger_data, :actions_taken)`,
    {
      replacements: {
        organizationId,
        rule_id: alert.rule_id,
        rule_name: alert.rule_name,
        trigger_type: alert.trigger_type,
        trigger_data: JSON.stringify(alert.trigger_data),
        actions_taken: JSON.stringify(alert.actions_taken),
      },
      ...(transaction ? { transaction } : {}),
    }
  );
}

