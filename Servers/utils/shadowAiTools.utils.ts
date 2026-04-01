/**
 * Shadow AI Tools Utils
 *
 * Database queries for managing shadow AI tools.
 */

import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import {
  IShadowAiTool,
  ShadowAiToolStatus,
} from "../domain.layer/interfaces/i.shadowAi";

/**
 * Get all tools for an organization with optional filtering.
 */
export async function getAllToolsQuery(
  organizationId: number,
  options?: {
    status?: ShadowAiToolStatus;
    sort?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ tools: IShadowAiTool[]; total: number }> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const whereConditions: string[] = ["organization_id = :organizationId"];
  const replacements: Record<string, any> = { organizationId, limit, offset };

  if (options?.status) {
    whereConditions.push("status = :status");
    replacements.status = options.status;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const sortColumn =
    options?.sort === "risk"
      ? "risk_score DESC NULLS LAST"
      : options?.sort === "users"
        ? "total_users DESC"
        : options?.sort === "events"
          ? "total_events DESC"
          : options?.sort === "name"
            ? "name ASC"
            : "last_seen_at DESC NULLS LAST";

  const [tools] = await sequelize.query(
    `SELECT * FROM shadow_ai_tools
     ${whereClause}
     ORDER BY ${sortColumn}
     LIMIT :limit OFFSET :offset`,
    { replacements }
  );

  const [countResult] = await sequelize.query(
    `SELECT COUNT(*) as total FROM shadow_ai_tools ${whereClause}`,
    { replacements }
  );

  return {
    tools: tools as IShadowAiTool[],
    total: parseInt((countResult as any[])[0].total, 10),
  };
}

/**
 * Get a single tool by ID with department breakdown.
 */
export async function getToolByIdQuery(
  organizationId: number,
  toolId: number
): Promise<IShadowAiTool | null> {
  const [rows] = await sequelize.query(
    `SELECT * FROM shadow_ai_tools WHERE organization_id = :organizationId AND id = :toolId`,
    { replacements: { organizationId, toolId } }
  );

  const tools = rows as IShadowAiTool[];
  return tools.length > 0 ? tools[0] : null;
}

/**
 * Get department breakdown for a tool.
 */
export async function getToolDepartmentsQuery(
  organizationId: number,
  toolId: number
): Promise<Array<{ department: string; user_count: number; event_count: number }>> {
  const [rows] = await sequelize.query(
    `SELECT
       COALESCE(department, 'Unknown') as department,
       COUNT(DISTINCT user_email) as user_count,
       COUNT(*) as event_count
     FROM shadow_ai_events
     WHERE organization_id = :organizationId
       AND detected_tool_id = :toolId
       AND event_timestamp > NOW() - INTERVAL '30 days'
     GROUP BY department
     ORDER BY event_count DESC`,
    { replacements: { organizationId, toolId } }
  );

  return rows as any[];
}

/**
 * Get top users for a tool.
 */
export async function getToolTopUsersQuery(
  organizationId: number,
  toolId: number,
  limit: number = 10
): Promise<Array<{ user_email: string; event_count: number; last_used: string }>> {
  const [rows] = await sequelize.query(
    `SELECT
       user_email,
       COUNT(*) as event_count,
       MAX(event_timestamp) as last_used
     FROM shadow_ai_events
     WHERE organization_id = :organizationId
       AND detected_tool_id = :toolId
       AND event_timestamp > NOW() - INTERVAL '30 days'
     GROUP BY user_email
     ORDER BY event_count DESC
     LIMIT :limit`,
    { replacements: { organizationId, toolId, limit } }
  );

  return rows as any[];
}

/**
 * Update tool status.
 */
export async function updateToolStatusQuery(
  organizationId: number,
  toolId: number,
  status: ShadowAiToolStatus,
  transaction?: Transaction
): Promise<IShadowAiTool | null> {
  const [rows] = await sequelize.query(
    `UPDATE shadow_ai_tools
     SET status = :status, updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :toolId
     RETURNING *`,
    {
      replacements: { organizationId, toolId, status },
      ...(transaction ? { transaction } : {}),
    }
  );

  const tools = rows as IShadowAiTool[];
  return tools.length > 0 ? tools[0] : null;
}

/**
 * Link a tool to a model inventory entry.
 */
export async function linkToolToModelInventoryQuery(
  organizationId: number,
  toolId: number,
  modelInventoryId: number,
  riskEntryId?: number,
  transaction?: Transaction
): Promise<void> {
  await sequelize.query(
    `UPDATE shadow_ai_tools
     SET model_inventory_id = :modelInventoryId,
         risk_entry_id = :riskEntryId,
         updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :toolId`,
    {
      replacements: {
        organizationId,
        toolId,
        modelInventoryId,
        riskEntryId: riskEntryId || null,
      },
      ...(transaction ? { transaction } : {}),
    }
  );
}
