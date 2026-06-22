/**
 * AI Audit Analytics Utils
 *
 * Aggregation queries for the AI Action Audit Dashboard.
 */

import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

interface AnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
}

function dateCondition(
  alias: string,
  filters?: AnalyticsFilters,
): { sql: string; replacements: Record<string, unknown> } {
  const conditions: string[] = [];
  const replacements: Record<string, unknown> = {};
  if (filters?.dateFrom) {
    conditions.push(`${alias}.created_at >= :dateFrom`);
    replacements.dateFrom = filters.dateFrom;
  }
  if (filters?.dateTo) {
    conditions.push(`${alias}.created_at <= :dateTo`);
    replacements.dateTo = filters.dateTo;
  }
  return { sql: conditions.length ? " AND " + conditions.join(" AND ") : "", replacements };
}

/**
 * Get aggregated analytics for the dashboard.
 */
export async function getAIAuditAnalytics(
  organizationId: number,
  filters?: AnalyticsFilters,
): Promise<Record<string, unknown>> {
  const dc = dateCondition("aa", filters);

  // Summary stats
  const [summary] = (await sequelize.query(
    `SELECT
       COUNT(*) as total_actions,
       COUNT(*) FILTER (WHERE state = 'completed' AND rule_matched LIKE 'auto_approve%') as auto_approved,
       COUNT(*) FILTER (WHERE state = 'completed' AND (rule_matched IS NULL OR rule_matched NOT LIKE 'auto_approve%')) as human_approved,
       COUNT(*) FILTER (WHERE state = 'rejected') as rejected,
       COUNT(*) FILTER (WHERE state IN ('auto_reject', 'failed')) as auto_rejected_or_failed,
       COUNT(*) FILTER (WHERE state = 'pending_approval') as pending,
       ROUND(AVG(EXTRACT(EPOCH FROM (approved_at - created_at))) FILTER (WHERE approved_at IS NOT NULL), 2) as avg_wait_seconds,
       ROUND(100.0 * COUNT(*) FILTER (WHERE state = 'completed' AND rule_matched LIKE 'auto_approve%') / NULLIF(COUNT(*), 0), 2) as auto_approve_pct,
       ROUND(100.0 * COUNT(*) FILTER (WHERE state = 'rejected') / NULLIF(COUNT(*), 0), 2) as rejection_rate_pct
     FROM ai_action_approvals aa
     WHERE organization_id = :organizationId ${dc.sql}`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];

  // Actions by state
  const byState = (await sequelize.query(
    `SELECT state, COUNT(*) as count
     FROM ai_action_approvals aa
     WHERE organization_id = :organizationId ${dc.sql}
     GROUP BY state ORDER BY count DESC`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];

  // Actions by tool category (derived from tool_name)
  const byCategory = (await sequelize.query(
    `SELECT
       CASE
         WHEN tool_name LIKE '%risk%' THEN 'Risk'
         WHEN tool_name LIKE '%policy%' THEN 'Policy'
         WHEN tool_name LIKE '%vendor%' THEN 'Vendor'
         WHEN tool_name LIKE '%model%' THEN 'Model'
         WHEN tool_name LIKE '%task%' THEN 'Task'
         WHEN tool_name LIKE '%incident%' THEN 'Incident'
         WHEN tool_name LIKE '%training%' THEN 'Training'
         WHEN tool_name LIKE '%evidence%' THEN 'Evidence'
         WHEN tool_name LIKE '%notification%' THEN 'Notification'
         WHEN tool_name LIKE '%admin%' THEN 'Admin'
         ELSE 'Other'
       END as category,
       COUNT(*) as count
     FROM ai_action_approvals aa
     WHERE organization_id = :organizationId ${dc.sql}
     GROUP BY category ORDER BY count DESC`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];

  // Top rules matched
  const topRules = (await sequelize.query(
    `SELECT rule_matched, COUNT(*) as count
     FROM ai_action_approvals aa
     WHERE organization_id = :organizationId AND rule_matched IS NOT NULL ${dc.sql}
     GROUP BY rule_matched ORDER BY count DESC LIMIT 10`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];

  // Daily volume (last 30 days)
  const dailyVolume = (await sequelize.query(
    `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM ai_action_approvals aa
     WHERE organization_id = :organizationId
       AND created_at >= NOW() - INTERVAL '30 days' ${dc.sql}
     GROUP BY DATE(created_at) ORDER BY date ASC`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];

  // Top users
  const topUsers = (await sequelize.query(
    `SELECT aa.requested_by as user_id, u.name, u.surname, COUNT(*) as count
     FROM ai_action_approvals aa
     LEFT JOIN users u ON aa.requested_by = u.id
     WHERE aa.organization_id = :organizationId ${dc.sql}
     GROUP BY aa.requested_by, u.name, u.surname
     ORDER BY count DESC LIMIT 10`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];

  return {
    summary: summary || {},
    byState,
    byCategory,
    topRules,
    dailyVolume,
    topUsers,
  };
}

/**
 * Export audit data as flat rows for CSV.
 */
export async function getAuditExportData(
  organizationId: number,
  filters?: AnalyticsFilters,
): Promise<Record<string, unknown>[]> {
  const dc = dateCondition("aa", filters);

  return (await sequelize.query(
    `SELECT
       aa.id, aa.tool_name, aa.action_type, aa.risk_level, aa.state,
       aa.rule_matched, aa.error_message,
       aa.created_at, aa.approved_at, aa.executed_at,
       u.name || ' ' || u.surname as requested_by_name,
       au.name || ' ' || au.surname as approved_by_name
     FROM ai_action_approvals aa
     LEFT JOIN users u ON aa.requested_by = u.id
     LEFT JOIN users au ON aa.approved_by = au.id
     WHERE aa.organization_id = :organizationId ${dc.sql}
     ORDER BY aa.created_at DESC
     LIMIT 10000`,
    { replacements: { organizationId, ...dc.replacements }, type: QueryTypes.SELECT },
  )) as any[];
}
