import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const fetchEventLogs = async (
  params: {
    entity_type?: string;
    entity_id?: number;
    user_id?: number;
    action?: string;
    limit?: number;
  },
  organizationId: number,
): Promise<any> => {
  try {
    const conditions: string[] = ["organization_id = :organization_id"];
    const replacements: Record<string, any> = { organization_id: organizationId };

    if (params.entity_type) {
      conditions.push("entity_type = :entity_type");
      replacements.entity_type = params.entity_type;
    }
    if (params.entity_id) {
      conditions.push("entity_id = :entity_id");
      replacements.entity_id = params.entity_id;
    }
    if (params.user_id) {
      conditions.push("user_id = :user_id");
      replacements.user_id = params.user_id;
    }
    if (params.action) {
      conditions.push("action = :action");
      replacements.action = params.action;
    }

    const limit = params.limit || 50;
    replacements.limit = limit;

    const rows = (await sequelize.query(
      `SELECT id, entry_type, user_id, occurred_at, event_type, entity_type,
              entity_id, action, field_name, old_value, new_value, description
       FROM audit_ledger
       WHERE ${conditions.join(" AND ")}
       ORDER BY occurred_at DESC
       LIMIT :limit`,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    )) as any[];

    return {
      event_logs: rows.map((r: any) => ({
        id: r.id,
        entry_type: r.entry_type,
        user_id: r.user_id,
        occurred_at: r.occurred_at,
        event_type: r.event_type,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        action: r.action,
        field_name: r.field_name,
        description: r.description,
      })),
      count: rows.length,
      filters_applied: {
        entity_type: params.entity_type || null,
        entity_id: params.entity_id || null,
        user_id: params.user_id || null,
        action: params.action || null,
      },
    };
  } catch (error) {
    logger.error("Error fetching event logs:", error);
    throw new Error(
      `Failed to fetch event logs: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getAuditTrailForEntity = async (
  params: { entity_type: string; entity_id: number; limit?: number },
  organizationId: number,
): Promise<any> => {
  try {
    const limit = params.limit || 100;

    const rows = (await sequelize.query(
      `SELECT id, entry_type, user_id, occurred_at, event_type, entity_type,
              entity_id, action, field_name, old_value, new_value, description
       FROM audit_ledger
       WHERE organization_id = :organization_id
       AND entity_type = :entity_type
       AND entity_id = :entity_id
       ORDER BY occurred_at ASC
       LIMIT :limit`,
      {
        replacements: {
          organization_id: organizationId,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          limit,
        },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Build a summary of changes
    const actionCounts: Record<string, number> = {};
    const userIds = new Set<number>();
    for (const row of rows) {
      const action = row.action || row.event_type || "unknown";
      actionCounts[action] = (actionCounts[action] || 0) + 1;
      if (row.user_id) userIds.add(row.user_id);
    }

    return {
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      audit_entries: rows.map((r: any) => ({
        id: r.id,
        entry_type: r.entry_type,
        user_id: r.user_id,
        occurred_at: r.occurred_at,
        action: r.action,
        field_name: r.field_name,
        old_value: r.old_value,
        new_value: r.new_value,
        description: r.description,
      })),
      total_entries: rows.length,
      summary: {
        action_counts: actionCounts,
        unique_users: userIds.size,
        first_entry: rows.length > 0 ? rows[0].occurred_at : null,
        last_entry: rows.length > 0 ? rows[rows.length - 1].occurred_at : null,
      },
    };
  } catch (error) {
    logger.error("Error getting audit trail:", error);
    throw new Error(
      `Failed to get audit trail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableAuditLedgerTools: any = {
  fetch_event_logs: fetchEventLogs,
  get_audit_trail_for_entity: getAuditTrailForEntity,
};

export { availableAuditLedgerTools };
