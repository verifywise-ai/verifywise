import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

export interface AgentPrimitive {
  id: number;
  source_system: string;
  primitive_type: string;
  external_id: string;
  display_name: string;
  owner_id: string | null;
  permissions: any[];
  permission_categories: string[];
  last_activity: string | null;
  metadata: Record<string, any>;
  review_status: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  linked_model_inventory_id: number | null;
  is_stale: boolean;
  is_manual: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentPrimitiveFilters {
  review_status?: string;
  source_system?: string;
  primitive_type?: string;
  is_stale?: boolean;
  search?: string;
}

export interface SyncLogEntry {
  id?: number;
  source_system: string;
  status: string;
  primitives_found: number;
  primitives_created: number;
  primitives_updated: number;
  primitives_stale_flagged: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  triggered_by: string;
}

// ─── Agent Primitives ────────────────────────────────────────────

export const getAllAgentPrimitivesQuery = async (
  organizationId: number,
  filters: AgentPrimitiveFilters = {}
): Promise<AgentPrimitive[]> => {
  const conditions: string[] = ["organization_id = :organizationId"];
  const replacements: Record<string, any> = { organizationId };

  if (filters.review_status) {
    conditions.push("review_status = :review_status");
    replacements.review_status = filters.review_status;
  }
  if (filters.source_system) {
    conditions.push("source_system = :source_system");
    replacements.source_system = filters.source_system;
  }
  if (filters.primitive_type) {
    conditions.push("primitive_type = :primitive_type");
    replacements.primitive_type = filters.primitive_type;
  }
  if (filters.is_stale !== undefined) {
    conditions.push("is_stale = :is_stale");
    replacements.is_stale = filters.is_stale;
  }
  if (filters.search) {
    conditions.push("(display_name ILIKE :search OR external_id ILIKE :search OR owner_id ILIKE :search)");
    replacements.search = `%${filters.search}%`;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const results = await sequelize.query(
    `SELECT * FROM agent_primitives ${whereClause} ORDER BY created_at DESC, id ASC`,
    { replacements, type: QueryTypes.SELECT }
  );
  return results as AgentPrimitive[];
};

export const getAgentPrimitiveByIdQuery = async (
  id: number,
  organizationId: number
): Promise<AgentPrimitive | null> => {
  const results = await sequelize.query(
    `SELECT * FROM agent_primitives WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT }
  );
  return (results as AgentPrimitive[])[0] || null;
};

export const createAgentPrimitiveQuery = async (
  data: {
    source_system: string;
    primitive_type: string;
    external_id: string;
    display_name: string;
    owner_id?: string;
    permissions?: any[];
    permission_categories?: string[];
    metadata?: Record<string, any>;
    is_manual?: boolean;
  },
  organizationId: number
): Promise<AgentPrimitive> => {
  const externalId = data.external_id || `manual_${Date.now()}`;
  const [results] = await sequelize.query(
    `INSERT INTO agent_primitives (
      organization_id, source_system, primitive_type, external_id, display_name,
      owner_id, permissions, permission_categories, metadata, is_manual,
      created_at, updated_at
    ) VALUES (
      :organizationId, :source_system, :primitive_type, :external_id, :display_name,
      :owner_id, :permissions, :permission_categories, :metadata, :is_manual,
      NOW(), NOW()
    ) RETURNING *`,
    {
      replacements: {
        organizationId,
        source_system: data.source_system || "manual",
        primitive_type: data.primitive_type,
        external_id: externalId,
        display_name: data.display_name,
        owner_id: data.owner_id || null,
        permissions: JSON.stringify(data.permissions || []),
        permission_categories: JSON.stringify(data.permission_categories || []),
        metadata: JSON.stringify(data.metadata || {}),
        is_manual: data.is_manual ?? true,
      },
    }
  );
  return (results as AgentPrimitive[])[0];
};

export const updateAgentPrimitiveQuery = async (
  id: number,
  data: {
    display_name?: string;
    primitive_type?: string;
    owner_id?: string | null;
    metadata?: Record<string, any>;
  },
  organizationId: number
): Promise<AgentPrimitive | null> => {
  const sets: string[] = [];
  const replacements: Record<string, any> = { organizationId, id };

  if (data.display_name !== undefined) {
    sets.push("display_name = :display_name");
    replacements.display_name = data.display_name;
  }
  if (data.primitive_type !== undefined) {
    sets.push("primitive_type = :primitive_type");
    replacements.primitive_type = data.primitive_type;
  }
  if (data.owner_id !== undefined) {
    sets.push("owner_id = :owner_id");
    replacements.owner_id = data.owner_id;
  }
  if (data.metadata !== undefined) {
    sets.push("metadata = :metadata");
    replacements.metadata = JSON.stringify(data.metadata);
  }

  sets.push("updated_at = NOW()");

  const [results] = await sequelize.query(
    `UPDATE agent_primitives SET ${sets.join(", ")} WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    { replacements }
  );
  return (results as AgentPrimitive[])[0] || null;
};

export const deleteAgentPrimitiveByIdQuery = async (
  id: number,
  organizationId: number
): Promise<boolean> => {
  const [, meta] = await sequelize.query(
    `DELETE FROM agent_primitives WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id } }
  );
  return ((meta as any)?.rowCount ?? 0) > 0;
};

export const updateReviewStatusQuery = async (
  id: number,
  status: string,
  userId: number,
  organizationId: number
): Promise<AgentPrimitive | null> => {
  const [results] = await sequelize.query(
    `UPDATE agent_primitives
     SET review_status = :status, reviewed_by = :userId, reviewed_at = NOW(), updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :id
     RETURNING *`,
    { replacements: { organizationId, id, status, userId } }
  );
  return (results as AgentPrimitive[])[0] || null;
};

export const linkModelQuery = async (
  id: number,
  modelId: number,
  organizationId: number
): Promise<AgentPrimitive | null> => {
  const [results] = await sequelize.query(
    `UPDATE agent_primitives
     SET linked_model_inventory_id = :modelId, updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :id
     RETURNING *`,
    { replacements: { organizationId, id, modelId } }
  );
  return (results as AgentPrimitive[])[0] || null;
};

export const unlinkModelQuery = async (
  id: number,
  organizationId: number
): Promise<AgentPrimitive | null> => {
  const [results] = await sequelize.query(
    `UPDATE agent_primitives
     SET linked_model_inventory_id = NULL, updated_at = NOW()
     WHERE organization_id = :organizationId AND id = :id
     RETURNING *`,
    { replacements: { organizationId, id } }
  );
  return (results as AgentPrimitive[])[0] || null;
};

export const upsertAgentPrimitivesQuery = async (
  primitives: Array<{
    source_system: string;
    primitive_type: string;
    external_id: string;
    display_name: string;
    owner_id?: string;
    permissions?: any[];
    permission_categories?: string[];
    last_activity?: string;
    metadata?: Record<string, any>;
  }>,
  organizationId: number
): Promise<{ created: number; updated: number }> => {
  let created = 0;
  let updated = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < primitives.length; i += BATCH_SIZE) {
    const batch = primitives.slice(i, i + BATCH_SIZE);

    for (const p of batch) {
      const [results] = await sequelize.query(
        `INSERT INTO agent_primitives (
          organization_id, source_system, primitive_type, external_id, display_name,
          owner_id, permissions, permission_categories, last_activity, metadata,
          created_at, updated_at
        ) VALUES (
          :organizationId, :source_system, :primitive_type, :external_id, :display_name,
          :owner_id, :permissions, :permission_categories, :last_activity, :metadata,
          NOW(), NOW()
        )
        ON CONFLICT (organization_id, source_system, external_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          primitive_type = EXCLUDED.primitive_type,
          owner_id = EXCLUDED.owner_id,
          permissions = EXCLUDED.permissions,
          permission_categories = EXCLUDED.permission_categories,
          last_activity = EXCLUDED.last_activity,
          metadata = EXCLUDED.metadata,
          is_stale = false,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        {
          replacements: {
            organizationId,
            source_system: p.source_system,
            primitive_type: p.primitive_type,
            external_id: p.external_id,
            display_name: p.display_name,
            owner_id: p.owner_id || null,
            permissions: JSON.stringify(p.permissions || []),
            permission_categories: JSON.stringify(p.permission_categories || []),
            last_activity: p.last_activity || null,
            metadata: JSON.stringify(p.metadata || {}),
          },
        }
      );
      const row = (results as any[])[0];
      if (row?.is_insert) {
        created++;
      } else {
        updated++;
      }
    }
  }

  return { created, updated };
};

export const flagStaleAgentsQuery = async (
  source: string,
  organizationId: number
): Promise<number> => {
  const [, meta] = await sequelize.query(
    `UPDATE agent_primitives
     SET is_stale = true, updated_at = NOW()
     WHERE organization_id = :organizationId
       AND source_system = :source
       AND last_activity IS NOT NULL
       AND last_activity < NOW() - INTERVAL '30 days'
       AND is_stale = false`,
    { replacements: { organizationId, source } }
  );
  return (meta as any)?.rowCount ?? 0;
};

export const getAgentStatsQuery = async (
  organizationId: number
): Promise<{
  total: number;
  unreviewed: number;
  confirmed: number;
  rejected: number;
  stale: number;
}> => {
  const results = await sequelize.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE review_status = 'unreviewed') AS unreviewed,
       COUNT(*) FILTER (WHERE review_status = 'confirmed') AS confirmed,
       COUNT(*) FILTER (WHERE review_status = 'rejected') AS rejected,
       COUNT(*) FILTER (WHERE is_stale = true) AS stale
     FROM agent_primitives
     WHERE organization_id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  );
  const row = (results as any[])[0];
  return {
    total: parseInt(row.total, 10),
    unreviewed: parseInt(row.unreviewed, 10),
    confirmed: parseInt(row.confirmed, 10),
    rejected: parseInt(row.rejected, 10),
    stale: parseInt(row.stale, 10),
  };
};

// ─── Sync Logs ───────────────────────────────────────────────────

export const createSyncLogQuery = async (
  data: { source_system: string; triggered_by: string },
  organizationId: number
): Promise<SyncLogEntry> => {
  const [results] = await sequelize.query(
    `INSERT INTO agent_discovery_sync_log (organization_id, source_system, status, triggered_by, started_at)
     VALUES (:organizationId, :source_system, 'running', :triggered_by, NOW())
     RETURNING *`,
    {
      replacements: {
        organizationId,
        source_system: data.source_system,
        triggered_by: data.triggered_by,
      },
    }
  );
  return (results as SyncLogEntry[])[0];
};

export const updateSyncLogQuery = async (
  id: number,
  data: Partial<SyncLogEntry>,
  organizationId: number
): Promise<SyncLogEntry | null> => {
  const sets: string[] = [];
  const replacements: Record<string, any> = { organizationId, id };

  if (data.status !== undefined) {
    sets.push("status = :status");
    replacements.status = data.status;
  }
  if (data.primitives_found !== undefined) {
    sets.push("primitives_found = :primitives_found");
    replacements.primitives_found = data.primitives_found;
  }
  if (data.primitives_created !== undefined) {
    sets.push("primitives_created = :primitives_created");
    replacements.primitives_created = data.primitives_created;
  }
  if (data.primitives_updated !== undefined) {
    sets.push("primitives_updated = :primitives_updated");
    replacements.primitives_updated = data.primitives_updated;
  }
  if (data.primitives_stale_flagged !== undefined) {
    sets.push("primitives_stale_flagged = :primitives_stale_flagged");
    replacements.primitives_stale_flagged = data.primitives_stale_flagged;
  }
  if (data.error_message !== undefined) {
    sets.push("error_message = :error_message");
    replacements.error_message = data.error_message;
  }
  if (data.completed_at !== undefined) {
    sets.push("completed_at = :completed_at");
    replacements.completed_at = data.completed_at;
  } else if (data.status === "success" || data.status === "failed") {
    sets.push("completed_at = NOW()");
  }

  if (sets.length === 0) return null;

  const [results] = await sequelize.query(
    `UPDATE agent_discovery_sync_log SET ${sets.join(", ")} WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    { replacements }
  );
  return (results as SyncLogEntry[])[0] || null;
};

export const getSyncLogsQuery = async (
  organizationId: number
): Promise<SyncLogEntry[]> => {
  const results = await sequelize.query(
    `SELECT * FROM agent_discovery_sync_log WHERE organization_id = :organizationId ORDER BY started_at DESC LIMIT 50`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  );
  return results as SyncLogEntry[];
};

export const getLatestSyncStatusQuery = async (
  organizationId: number
): Promise<SyncLogEntry | null> => {
  const results = await sequelize.query(
    `SELECT * FROM agent_discovery_sync_log WHERE organization_id = :organizationId ORDER BY started_at DESC LIMIT 1`,
    { replacements: { organizationId }, type: QueryTypes.SELECT }
  );
  return (results as SyncLogEntry[])[0] || null;
};

// ─── Audit Log ────────────────────────────────────────────────────

export interface AuditLogEntry {
  id?: number;
  agent_primitive_id: number;
  action: string;
  field_changed?: string;
  old_value?: string;
  new_value?: string;
  performed_by?: number;
  created_at?: string;
}

export const createAuditLogQuery = async (
  data: {
    agent_primitive_id: number;
    action: string;
    field_changed?: string | null;
    old_value?: string | null;
    new_value?: string | null;
    performed_by?: number;
  },
  organizationId: number
): Promise<AuditLogEntry> => {
  const [results] = await sequelize.query(
    `INSERT INTO agent_audit_log
     (organization_id, agent_primitive_id, action, field_changed, old_value, new_value, performed_by, created_at)
     VALUES (:organizationId, :agent_primitive_id, :action, :field_changed, :old_value, :new_value, :performed_by, NOW())
     RETURNING *`,
    {
      replacements: {
        organizationId,
        agent_primitive_id: data.agent_primitive_id,
        action: data.action,
        field_changed: data.field_changed || null,
        old_value: data.old_value || null,
        new_value: data.new_value || null,
        performed_by: data.performed_by || null,
      },
    }
  );
  return (results as AuditLogEntry[])[0];
};

export const getAuditLogsForAgentQuery = async (
  agentId: number,
  organizationId: number
): Promise<AuditLogEntry[]> => {
  const results = await sequelize.query(
    `SELECT * FROM agent_audit_log
     WHERE organization_id = :organizationId AND agent_primitive_id = :agentId
     ORDER BY created_at DESC
     LIMIT 100`,
    { replacements: { organizationId, agentId }, type: QueryTypes.SELECT }
  );
  return results as AuditLogEntry[];
};
