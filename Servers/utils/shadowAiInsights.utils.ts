/**
 * Shadow AI Insights Utils
 *
 * Database queries for insights dashboard: summary stats,
 * top tools, department breakdowns, and trends.
 */

import { sequelize } from "../database/db";
import {
  ShadowAiInsightsSummary,
  ShadowAiToolByEvents,
  ShadowAiToolByUsers,
  ShadowAiUsersByDepartment,
  ShadowAiTrendPoint,
  ShadowAiUserActivity,
  ShadowAiDepartmentActivity,
} from "../domain.layer/interfaces/i.shadowAi";

/**
 * Get summary stats for the insights dashboard.
 */
export async function getInsightsSummaryQuery(
  organizationId: number,
  periodDays: number = 30
): Promise<ShadowAiInsightsSummary> {
  const [rows] = await sequelize.query(
    `SELECT
       (SELECT COUNT(*) FROM shadow_ai_tools WHERE organization_id = :organizationId) as unique_apps,
       (SELECT COUNT(DISTINCT user_email)
        FROM shadow_ai_events
        WHERE organization_id = :organizationId
          AND event_timestamp > NOW() - INTERVAL '1 day' * :periodDays) as total_ai_users,
       (SELECT COUNT(DISTINCT department)
        FROM shadow_ai_events
        WHERE organization_id = :organizationId
          AND department IS NOT NULL
          AND event_timestamp > NOW() - INTERVAL '1 day' * :periodDays) as departments_using_ai`,
    { replacements: { organizationId, periodDays } }
  );

  const stats = (rows as any[])[0];

  // Highest risk tool (small table, fast query)
  const [riskResult] = await sequelize.query(
    `SELECT name, risk_score
     FROM shadow_ai_tools
     WHERE organization_id = :organizationId AND risk_score IS NOT NULL
     ORDER BY risk_score DESC
     LIMIT 1`,
    { replacements: { organizationId } }
  );

  // Most active department (uses composite index dept+timestamp)
  const [deptResult] = await sequelize.query(
    `SELECT department
     FROM shadow_ai_events
     WHERE organization_id = :organizationId
       AND department IS NOT NULL
       AND event_timestamp > NOW() - INTERVAL '1 day' * :periodDays
     GROUP BY department
     ORDER BY COUNT(*) DESC
     LIMIT 1`,
    { replacements: { organizationId, periodDays } }
  );

  return {
    unique_apps: parseInt(stats.unique_apps, 10),
    total_ai_users: parseInt(stats.total_ai_users, 10),
    highest_risk_tool:
      (riskResult as any[]).length > 0
        ? {
            name: (riskResult as any[])[0].name,
            risk_score: (riskResult as any[])[0].risk_score,
          }
        : null,
    most_active_department:
      (deptResult as any[]).length > 0
        ? (deptResult as any[])[0].department
        : null,
    departments_using_ai: parseInt(stats.departments_using_ai, 10),
  };
}

/**
 * Get top tools by event count.
 */
export async function getToolsByEventsQuery(
  organizationId: number,
  periodDays: number = 30,
  limit: number = 6
): Promise<ShadowAiToolByEvents[]> {
  const [rows] = await sequelize.query(
    `SELECT t.name as tool_name, COUNT(e.id) as event_count
     FROM shadow_ai_events e
     JOIN shadow_ai_tools t ON e.organization_id = t.organization_id AND e.detected_tool_id = t.id
     WHERE e.organization_id = :organizationId
       AND e.event_timestamp > NOW() - INTERVAL '1 day' * :periodDays
     GROUP BY t.name
     ORDER BY event_count DESC
     LIMIT :limit`,
    { replacements: { organizationId, periodDays, limit } }
  );

  return (rows as any[]).map((r) => ({
    tool_name: r.tool_name,
    event_count: parseInt(r.event_count, 10),
  }));
}

/**
 * Get top tools by unique user count.
 */
export async function getToolsByUsersQuery(
  organizationId: number,
  periodDays: number = 30,
  limit: number = 6
): Promise<ShadowAiToolByUsers[]> {
  const [rows] = await sequelize.query(
    `SELECT t.name as tool_name, COUNT(DISTINCT e.user_email) as user_count
     FROM shadow_ai_events e
     JOIN shadow_ai_tools t ON e.organization_id = t.organization_id AND e.detected_tool_id = t.id
     WHERE e.organization_id = :organizationId
       AND e.event_timestamp > NOW() - INTERVAL '1 day' * :periodDays
     GROUP BY t.name
     ORDER BY user_count DESC
     LIMIT :limit`,
    { replacements: { organizationId, periodDays, limit } }
  );

  return (rows as any[]).map((r) => ({
    tool_name: r.tool_name,
    user_count: parseInt(r.user_count, 10),
  }));
}

/**
 * Get users by department for pie chart.
 */
export async function getUsersByDepartmentQuery(
  organizationId: number,
  periodDays: number = 30
): Promise<ShadowAiUsersByDepartment[]> {
  const [rows] = await sequelize.query(
    `SELECT
       COALESCE(department, 'Unknown') as department,
       COUNT(DISTINCT user_email) as user_count
     FROM shadow_ai_events
     WHERE organization_id = :organizationId
       AND event_timestamp > NOW() - INTERVAL '1 day' * :periodDays
     GROUP BY department
     ORDER BY user_count DESC`,
    { replacements: { organizationId, periodDays } }
  );

  return (rows as any[]).map((r) => ({
    department: r.department,
    user_count: parseInt(r.user_count, 10),
  }));
}

/**
 * Get trend data for the line chart.
 */
export async function getTrendQuery(
  organizationId: number,
  periodDays: number = 90,
  granularity: "daily" | "weekly" | "monthly" = "daily"
): Promise<ShadowAiTrendPoint[]> {
  const DATE_FORMAT_MAP: Record<string, string> = {
    monthly: "YYYY-MM-01",
    weekly: "IYYY-IW",
    daily: "YYYY-MM-DD",
  };
  const dateFormat = DATE_FORMAT_MAP[granularity] || DATE_FORMAT_MAP.daily;

  const [rows] = await sequelize.query(
    `WITH period_events AS (
       SELECT event_timestamp, user_email, detected_tool_id
       FROM shadow_ai_events
       WHERE organization_id = :organizationId
         AND event_timestamp > NOW() - INTERVAL '1 day' * :periodDays
     ),
     new_tool_dates AS (
       SELECT id, DATE(first_detected_at) as detected_date
       FROM shadow_ai_tools
       WHERE organization_id = :organizationId
         AND first_detected_at > NOW() - INTERVAL '1 day' * :periodDays
     )
     SELECT
       TO_CHAR(pe.event_timestamp, :dateFormat) as date,
       COUNT(*) as total_events,
       COUNT(DISTINCT pe.user_email) as unique_users,
       COUNT(DISTINCT CASE
         WHEN ntd.id IS NOT NULL THEN pe.detected_tool_id
       END) as new_tools
     FROM period_events pe
     LEFT JOIN new_tool_dates ntd
       ON pe.detected_tool_id = ntd.id
       AND ntd.detected_date = DATE(pe.event_timestamp)
     GROUP BY TO_CHAR(pe.event_timestamp, :dateFormat)
     ORDER BY date ASC`,
    { replacements: { organizationId, periodDays, dateFormat } }
  );

  return (rows as any[]).map((r) => ({
    date: r.date,
    total_events: parseInt(r.total_events, 10),
    unique_users: parseInt(r.unique_users, 10),
    new_tools: parseInt(r.new_tools, 10),
  }));
}

/**
 * Get user activity for the user activity table.
 */
export async function getUserActivityQuery(
  organizationId: number,
  options?: {
    page?: number;
    limit?: number;
    sort?: string;
    department?: string;
  }
): Promise<{ users: ShadowAiUserActivity[]; total: number }> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  let whereClause =
    "WHERE e.organization_id = :organizationId AND e.event_timestamp > NOW() - INTERVAL '30 days'";
  const replacements: Record<string, any> = { organizationId, limit, offset };

  if (options?.department) {
    whereClause += " AND e.department = :department";
    replacements.department = options.department;
  }

  const SORT_MAP: Record<string, string> = {
    risk: "risk_score DESC",
    email: "user_email ASC",
  };
  const sortColumn = SORT_MAP[options?.sort || ""] || "total_prompts DESC";

  const [rows] = await sequelize.query(
    `SELECT
       e.user_email,
       COUNT(CASE WHEN e.http_method = 'POST' THEN 1 END) as total_prompts,
       COALESCE(MAX(t.risk_score), 0) as risk_score,
       COALESCE(MAX(e.department), 'Unknown') as department
     FROM shadow_ai_events e
     LEFT JOIN shadow_ai_tools t ON e.organization_id = t.organization_id AND e.detected_tool_id = t.id
     ${whereClause}
     GROUP BY e.user_email
     ORDER BY ${sortColumn}
     LIMIT :limit OFFSET :offset`,
    { replacements }
  );

  const [countResult] = await sequelize.query(
    `SELECT COUNT(DISTINCT user_email) as total
     FROM shadow_ai_events e
     ${whereClause}`,
    { replacements }
  );

  return {
    users: (rows as any[]).map((r) => ({
      user_email: r.user_email,
      total_prompts: parseInt(r.total_prompts, 10),
      risk_score: parseInt(r.risk_score, 10),
      department: r.department,
    })),
    total: parseInt((countResult as any[])[0].total, 10),
  };
}

/**
 * Get department activity breakdown.
 */
export async function getDepartmentActivityQuery(
  organizationId: number
): Promise<ShadowAiDepartmentActivity[]> {
  const [rows] = await sequelize.query(
    `WITH top_tools AS (
       SELECT DISTINCT ON (department)
         COALESCE(department, 'Unknown') as department,
         detected_tool_id,
         COUNT(*) as tool_events
       FROM shadow_ai_events
       WHERE organization_id = :organizationId
         AND event_timestamp > NOW() - INTERVAL '30 days'
         AND detected_tool_id IS NOT NULL
       GROUP BY department, detected_tool_id
       ORDER BY department, tool_events DESC
     )
     SELECT
       COALESCE(e.department, 'Unknown') as department,
       COUNT(DISTINCT e.user_email) as users,
       COUNT(CASE WHEN e.http_method = 'POST' THEN 1 END) as total_prompts,
       t2.name as top_tool,
       COALESCE(MAX(t.risk_score), 0) as risk_score
     FROM shadow_ai_events e
     LEFT JOIN shadow_ai_tools t ON e.organization_id = t.organization_id AND e.detected_tool_id = t.id
     LEFT JOIN top_tools tt ON COALESCE(e.department, 'Unknown') = tt.department
     LEFT JOIN shadow_ai_tools t2 ON e.organization_id = t2.organization_id AND tt.detected_tool_id = t2.id
     WHERE e.organization_id = :organizationId
       AND e.event_timestamp > NOW() - INTERVAL '30 days'
     GROUP BY COALESCE(e.department, 'Unknown'), t2.name
     ORDER BY total_prompts DESC`,
    { replacements: { organizationId } }
  );

  return (rows as any[]).map((r) => ({
    department: r.department,
    users: parseInt(r.users, 10),
    total_prompts: parseInt(r.total_prompts, 10),
    top_tool: r.top_tool || "N/A",
    risk_score: parseInt(r.risk_score, 10),
  }));
}

/**
 * Get detailed activity for a specific user.
 */
export async function getUserDetailQuery(
  organizationId: number,
  userEmail: string,
  periodDays: number = 30
): Promise<
  Array<{
    tool_name: string;
    event_count: number;
    last_used: string;
  }>
> {
  const [rows] = await sequelize.query(
    `SELECT
       t.name as tool_name,
       COUNT(*) as event_count,
       MAX(e.event_timestamp) as last_used
     FROM shadow_ai_events e
     JOIN shadow_ai_tools t ON e.organization_id = t.organization_id AND e.detected_tool_id = t.id
     WHERE e.organization_id = :organizationId
       AND e.user_email = :userEmail
       AND e.event_timestamp > NOW() - INTERVAL '1 day' * :periodDays
     GROUP BY t.name
     ORDER BY event_count DESC`,
    { replacements: { organizationId, userEmail, periodDays } }
  );

  return rows as any[];
}
