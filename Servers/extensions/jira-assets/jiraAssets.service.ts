import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { encryptText, decryptText } from "../../tools/createSecureValue";
import { JiraAssetsClient, JiraObject } from "./jira.client";
import { transformAttributes } from "./jira.constants";

/**
 * DB-facing helpers for the jira-assets extension.
 *
 * Encryption note: the `api_token` submitted through /config is encrypted
 * with AES-256-CBC via `encryptText`/`decryptText` (see
 * Servers/tools/createSecureValue.ts). The `jira_assets_config` table
 * stores `api_token_encrypted` + `api_token_iv` for that pair. The
 * original plugin used base64 "encryption" — this port replaces it with
 * proper crypto to match the standard the slack_webhooks table already
 * uses in core.
 */

export interface JiraAssetsConfig {
  jira_base_url?: string;
  workspace_id?: string;
  email?: string;
  api_token?: string;
  deployment_type?: "cloud" | "datacenter";
  selected_schema_id?: string | null;
  selected_object_type_id?: string | null;
  sync_enabled?: boolean;
  sync_interval_hours?: number;
}

export interface JiraAssetsConfigRow {
  id: number;
  jira_base_url: string;
  workspace_id: string;
  email: string;
  deployment_type: string;
  selected_schema_id: string | null;
  selected_object_type_id: string | null;
  sync_enabled: boolean;
  sync_interval_hours: number;
  last_sync_at: Date | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  has_api_token: boolean;
}

export interface JiraSyncResult {
  success: boolean;
  objectsFetched: number;
  objectsCreated: number;
  objectsUpdated: number;
  objectsDeleted: number;
  syncedAt: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Config CRUD
// ---------------------------------------------------------------------------

export async function getPublicConfig(organizationId: number): Promise<JiraAssetsConfigRow | null> {
  const rows = (await sequelize.query(
    `SELECT id, jira_base_url, workspace_id, email, deployment_type,
            selected_schema_id, selected_object_type_id,
            sync_enabled, sync_interval_hours,
            last_sync_at, last_sync_status, last_sync_message,
            CASE WHEN api_token_encrypted IS NOT NULL AND api_token_encrypted <> ''
                 THEN TRUE ELSE FALSE END AS has_api_token
       FROM jira_assets_config
      WHERE organization_id = :organizationId
      LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as JiraAssetsConfigRow[];
  return rows[0] ?? null;
}

/**
 * Load config + decrypt api_token in one shot. Used by every route handler
 * that needs to talk to JIRA. Returns null when no config row exists.
 */
export async function loadFullConfig(organizationId: number): Promise<JiraAssetsConfig | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM jira_assets_config WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const row = rows[0];
  if (!row) return null;
  let apiToken: string | undefined;
  if (row.api_token_encrypted && row.api_token_iv) {
    const result = decryptText({ value: row.api_token_encrypted, iv: row.api_token_iv });
    if (!result.success) {
      throw new Error(`Failed to decrypt jira_assets api token: ${result.error}`);
    }
    apiToken = result.data;
  }
  return {
    jira_base_url: row.jira_base_url,
    workspace_id: row.workspace_id,
    email: row.email,
    api_token: apiToken,
    deployment_type: row.deployment_type ?? "cloud",
    selected_schema_id: row.selected_schema_id,
    selected_object_type_id: row.selected_object_type_id,
    sync_enabled: row.sync_enabled,
    sync_interval_hours: row.sync_interval_hours,
  };
}

/**
 * Upsert config for the caller org. `api_token` in `body` is optional on
 * update — omit it to keep the previously-stored value (matches the
 * password-preservation semantics of the extensions registry).
 */
export async function saveConfig(
  organizationId: number,
  userId: number,
  body: JiraAssetsConfig,
): Promise<void> {
  const existing = (await sequelize.query(
    `SELECT id, api_token_encrypted FROM jira_assets_config
      WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as Array<{ id: number; api_token_encrypted: string | null }>;
  const row = existing[0];
  const hasExistingToken = !!(row && row.api_token_encrypted);

  if (!body.jira_base_url) throw new Error("JIRA Base URL is required");
  if (!body.workspace_id) throw new Error("Workspace ID is required");
  if (!body.email) throw new Error("Email is required");
  if (!body.api_token && !hasExistingToken) throw new Error("API Token is required");

  const commonReplacements = {
    organizationId,
    jiraBaseUrl: body.jira_base_url,
    workspaceId: body.workspace_id,
    email: body.email,
    deploymentType: body.deployment_type ?? "cloud",
    selectedSchemaId: body.selected_schema_id ?? null,
    selectedObjectTypeId: body.selected_object_type_id ?? null,
    syncEnabled: body.sync_enabled ?? false,
    syncIntervalHours: body.sync_interval_hours ?? 24,
    userId,
  };

  if (row) {
    if (body.api_token) {
      const { value, iv } = encryptText(body.api_token);
      await sequelize.query(
        `UPDATE jira_assets_config
            SET jira_base_url = :jiraBaseUrl, workspace_id = :workspaceId, email = :email,
                api_token_encrypted = :apiTokenEncrypted, api_token_iv = :apiTokenIv,
                deployment_type = :deploymentType,
                selected_schema_id = :selectedSchemaId,
                selected_object_type_id = :selectedObjectTypeId,
                sync_enabled = :syncEnabled, sync_interval_hours = :syncIntervalHours,
                updated_by = :userId, updated_at = NOW()
          WHERE id = :id AND organization_id = :organizationId;`,
        {
          replacements: {
            ...commonReplacements,
            apiTokenEncrypted: value,
            apiTokenIv: iv,
            id: row.id,
          },
        },
      );
    } else {
      await sequelize.query(
        `UPDATE jira_assets_config
            SET jira_base_url = :jiraBaseUrl, workspace_id = :workspaceId, email = :email,
                deployment_type = :deploymentType,
                selected_schema_id = :selectedSchemaId,
                selected_object_type_id = :selectedObjectTypeId,
                sync_enabled = :syncEnabled, sync_interval_hours = :syncIntervalHours,
                updated_by = :userId, updated_at = NOW()
          WHERE id = :id AND organization_id = :organizationId;`,
        { replacements: { ...commonReplacements, id: row.id } },
      );
    }
  } else {
    const { value, iv } = encryptText(body.api_token as string);
    await sequelize.query(
      `INSERT INTO jira_assets_config
         (organization_id, jira_base_url, workspace_id, email,
          api_token_encrypted, api_token_iv, deployment_type,
          selected_schema_id, selected_object_type_id,
          sync_enabled, sync_interval_hours, created_by)
       VALUES (:organizationId, :jiraBaseUrl, :workspaceId, :email,
               :apiTokenEncrypted, :apiTokenIv, :deploymentType,
               :selectedSchemaId, :selectedObjectTypeId,
               :syncEnabled, :syncIntervalHours, :userId);`,
      {
        replacements: {
          ...commonReplacements,
          apiTokenEncrypted: value,
          apiTokenIv: iv,
        },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Client builder
// ---------------------------------------------------------------------------

export function clientFromConfig(config: JiraAssetsConfig): JiraAssetsClient {
  if (!config.jira_base_url || !config.workspace_id || !config.email || !config.api_token) {
    throw new Error("JIRA connection not fully configured");
  }
  return new JiraAssetsClient(
    config.jira_base_url,
    config.workspace_id,
    config.email,
    config.api_token,
    config.deployment_type ?? "cloud",
  );
}

// ---------------------------------------------------------------------------
// UC-ID generator
// ---------------------------------------------------------------------------

async function nextUcId(organizationId: number): Promise<string> {
  const rows = (await sequelize.query(
    `SELECT nextval('verifywise.jira_use_case_uc_id_seq') AS seq;`,
    { type: QueryTypes.SELECT },
  )) as Array<{ seq: string }>;
  return `UC-J${organizationId}-${rows[0].seq}`;
}

// ---------------------------------------------------------------------------
// Import selected objects (creates native projects + JIRA link rows)
// ---------------------------------------------------------------------------

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors?: string[];
}

export async function importObjects(
  organizationId: number,
  userId: number,
  objectIds: string[],
): Promise<ImportResult> {
  if (!Array.isArray(objectIds) || objectIds.length === 0) {
    throw new Error("No objects selected for import");
  }
  const config = await loadFullConfig(organizationId);
  if (!config) throw new Error("JIRA not configured");
  const client = clientFromConfig(config);

  // ID→name mapping so JIRA attribute IDs resolve to human names.
  const attrIdToName: Record<string, string> = {};
  if (config.selected_object_type_id) {
    const defs = await client.getAttributes(config.selected_object_type_id);
    for (const attr of defs) attrIdToName[attr.id] = attr.name;
  }

  const now = new Date();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const objectId of objectIds) {
    try {
      const existing = (await sequelize.query(
        `SELECT id FROM jira_assets_use_cases
          WHERE jira_object_id = :objectId AND organization_id = :organizationId;`,
        { replacements: { objectId, organizationId }, type: QueryTypes.SELECT },
      )) as Array<{ id: number }>;
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const jiraObj = await client.getObjectById(objectId);
      const jiraObjectId = String(jiraObj.id);
      const transformedAttrs = transformAttributes(jiraObj.attributes, attrIdToName);
      const name = jiraObj.label || transformedAttrs["Name"] || `JIRA-${jiraObj.objectKey}`;
      const description =
        transformedAttrs["Description / Purpose"] || transformedAttrs["Description"] || "";
      const ucId = await nextUcId(organizationId);

      const projectRows = (await sequelize.query(
        `INSERT INTO projects
           (organization_id, uc_id, project_title, owner, start_date, goal,
            geography, last_updated, created_at, _source, is_organizational)
         VALUES (:organizationId, :ucId, :title, :owner, :startDate, :goal,
                 1, :now, :now, 'jira-assets', FALSE)
         RETURNING id;`,
        {
          replacements: {
            organizationId,
            ucId,
            title: name,
            owner: userId ?? null,
            startDate: now,
            goal: description || "Imported from JIRA Assets",
            now,
          },
          type: QueryTypes.INSERT,
        },
      )) as unknown as [Array<{ id: number }>, number];
      const projectId = (projectRows[0] as any)[0].id;

      const data = {
        id: jiraObj.id,
        objectKey: jiraObj.objectKey,
        label: jiraObj.label,
        objectType: jiraObj.objectType,
        attributes: transformedAttrs,
        created: jiraObj.created,
        updated: jiraObj.updated,
      };

      await sequelize.query(
        `INSERT INTO jira_assets_use_cases
           (organization_id, jira_object_id, project_id, data, last_synced_at, sync_status)
         VALUES (:organizationId, :jiraObjectId, :projectId, CAST(:data AS JSONB), :now, 'synced');`,
        {
          replacements: {
            organizationId,
            jiraObjectId,
            projectId,
            data: JSON.stringify(data),
            now,
          },
        },
      );
      imported++;
    } catch (err: any) {
      errors.push(`Failed to import ${objectId}: ${err.message}`);
    }
  }

  return { success: true, imported, skipped, errors: errors.length > 0 ? errors : undefined };
}

// ---------------------------------------------------------------------------
// Sync (delta: create/update JIRA objects, delete removed ones)
// ---------------------------------------------------------------------------

export async function syncObjects(
  organizationId: number,
  triggeredBy: number | null,
  syncType: "manual" | "scheduled",
): Promise<JiraSyncResult> {
  const startedAt = new Date();
  const config = await loadFullConfig(organizationId);
  if (!config) throw new Error("JIRA not configured");
  if (!config.selected_object_type_id) throw new Error("No object type selected for sync");
  const client = clientFromConfig(config);

  // Record sync-start
  const historyRows = (await sequelize.query(
    `INSERT INTO jira_assets_sync_history
       (organization_id, sync_type, status, started_at, triggered_by)
     VALUES (:organizationId, :syncType, 'started', :startedAt, :triggeredBy)
     RETURNING id;`,
    {
      replacements: { organizationId, syncType, startedAt, triggeredBy },
      type: QueryTypes.INSERT,
    },
  )) as unknown as [Array<{ id: number }>, number];
  const historyId = (historyRows[0] as any)[0].id;

  const finalizeFailure = async (message: string) => {
    await sequelize.query(
      `UPDATE jira_assets_sync_history
          SET status = 'failed', error_message = :message, completed_at = :now
        WHERE id = :id AND organization_id = :organizationId;`,
      { replacements: { message, now: new Date(), id: historyId, organizationId } },
    );
    await sequelize.query(
      `UPDATE jira_assets_config
          SET last_sync_at = :now, last_sync_status = 'failed', last_sync_message = :message,
              updated_at = NOW()
        WHERE organization_id = :organizationId;`,
      { replacements: { now: new Date(), message, organizationId } },
    );
  };

  try {
    const jiraObjects: JiraObject[] = await client.getObjects(config.selected_object_type_id);
    const objectsFetched = jiraObjects.length;

    const existingRows = (await sequelize.query(
      `SELECT jira_object_id, project_id, data
         FROM jira_assets_use_cases
        WHERE organization_id = :organizationId;`,
      { replacements: { organizationId }, type: QueryTypes.SELECT },
    )) as Array<{ jira_object_id: string; project_id: number | null; data: any }>;
    const existingMap = new Map(existingRows.map((r) => [r.jira_object_id, r]));

    let objectsCreated = 0;
    let objectsUpdated = 0;
    let objectsDeleted = 0;
    const now = new Date();

    for (const jiraObj of jiraObjects) {
      const jiraObjectId = String(jiraObj.id);
      const existing = existingMap.get(jiraObjectId);
      const attrIdToName = (jiraObj as any)._attrIdToName || {};
      const transformedAttrs = transformAttributes(jiraObj.attributes || [], attrIdToName);
      const name = jiraObj.label || transformedAttrs["Name"] || `JIRA-${jiraObj.objectKey}`;
      const description =
        transformedAttrs["Description / Purpose"] || transformedAttrs["Description"] || "";
      const data = {
        id: jiraObj.id,
        objectKey: jiraObj.objectKey,
        label: jiraObj.label,
        objectType: jiraObj.objectType,
        attributes: transformedAttrs,
        created: jiraObj.created,
        updated: jiraObj.updated,
      };

      if (!existing) {
        const ucId = await nextUcId(organizationId);
        const projectRows = (await sequelize.query(
          `INSERT INTO projects
             (organization_id, uc_id, project_title, owner, start_date, goal,
              geography, last_updated, created_at, _source, is_organizational)
           VALUES (:organizationId, :ucId, :title, :owner, :now, :goal,
                   1, :now, :now, 'jira-assets', FALSE)
           RETURNING id;`,
          {
            replacements: {
              organizationId,
              ucId,
              title: name,
              owner: triggeredBy ?? null,
              goal: description || "Imported from JIRA Assets",
              now,
            },
            type: QueryTypes.INSERT,
          },
        )) as unknown as [Array<{ id: number }>, number];
        const projectId = (projectRows[0] as any)[0].id;

        await sequelize.query(
          `INSERT INTO jira_assets_use_cases
             (organization_id, jira_object_id, project_id, data, last_synced_at, sync_status)
           VALUES (:organizationId, :jiraObjectId, :projectId, CAST(:data AS JSONB), :now, 'synced');`,
          {
            replacements: {
              organizationId,
              jiraObjectId,
              projectId,
              data: JSON.stringify(data),
              now,
            },
          },
        );
        objectsCreated++;
      } else {
        if (existing.project_id !== null) {
          await sequelize.query(
            `UPDATE projects
                SET project_title = :title, goal = :goal, last_updated = :now
              WHERE id = :projectId AND organization_id = :organizationId;`,
            {
              replacements: {
                title: name,
                goal: description || "Imported from JIRA Assets",
                now,
                projectId: existing.project_id,
                organizationId,
              },
            },
          );
        }
        await sequelize.query(
          `UPDATE jira_assets_use_cases
              SET data = CAST(:data AS JSONB),
                  last_synced_at = :now,
                  sync_status = 'synced',
                  updated_at = NOW()
            WHERE jira_object_id = :jiraObjectId AND organization_id = :organizationId;`,
          {
            replacements: {
              data: JSON.stringify(data),
              now,
              jiraObjectId,
              organizationId,
            },
          },
        );
        objectsUpdated++;
      }
      existingMap.delete(jiraObjectId);
    }

    // Anything left in existingMap disappeared upstream — delete the native
    // project (jira_assets_use_cases row cascades via FK).
    for (const [, record] of existingMap) {
      if (record.project_id !== null) {
        await sequelize.query(
          `DELETE FROM projects WHERE id = :projectId AND organization_id = :organizationId;`,
          { replacements: { projectId: record.project_id, organizationId } },
        );
      }
      objectsDeleted++;
    }

    const completedAt = new Date();
    await sequelize.query(
      `UPDATE jira_assets_sync_history
          SET status = 'completed',
              objects_fetched = :objectsFetched,
              objects_created = :objectsCreated,
              objects_updated = :objectsUpdated,
              objects_deleted = :objectsDeleted,
              completed_at = :completedAt
        WHERE id = :id AND organization_id = :organizationId;`,
      {
        replacements: {
          objectsFetched,
          objectsCreated,
          objectsUpdated,
          objectsDeleted,
          completedAt,
          id: historyId,
          organizationId,
        },
      },
    );
    await sequelize.query(
      `UPDATE jira_assets_config
          SET last_sync_at = :now, last_sync_status = 'success',
              last_sync_message = NULL, updated_at = NOW()
        WHERE organization_id = :organizationId;`,
      { replacements: { now: completedAt, organizationId } },
    );

    return {
      success: true,
      objectsFetched,
      objectsCreated,
      objectsUpdated,
      objectsDeleted,
      syncedAt: completedAt.toISOString(),
      status: "success",
    };
  } catch (err: any) {
    await finalizeFailure(err.message);
    return {
      success: false,
      objectsFetched: 0,
      objectsCreated: 0,
      objectsUpdated: 0,
      objectsDeleted: 0,
      syncedAt: new Date().toISOString(),
      status: `failed: ${err.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Use-case reads / delete
// ---------------------------------------------------------------------------

export async function listUseCases(organizationId: number): Promise<any[]> {
  return (await sequelize.query(
    `SELECT j.*, p.uc_id, p.project_title AS name
       FROM jira_assets_use_cases j
  LEFT JOIN projects p ON j.project_id = p.id AND p.organization_id = :organizationId
      WHERE j.organization_id = :organizationId
      ORDER BY j.created_at DESC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
}

export async function getUseCaseByProjectId(
  projectId: number,
  organizationId: number,
): Promise<any | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM jira_assets_use_cases
      WHERE project_id = :projectId AND organization_id = :organizationId;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const uc = rows[0];
  if (!uc) return null;
  const data = typeof uc.data === "string" ? JSON.parse(uc.data) : uc.data;

  const projects = (await sequelize.query(
    `SELECT * FROM projects WHERE id = :projectId AND organization_id = :organizationId;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const nativeProject = projects[0] || {};

  const frameworks = (await sequelize.query(
    `SELECT pf.id, pf.framework_id, pf.id AS project_framework_id
       FROM projects_frameworks pf
      WHERE pf.project_id = :projectId AND pf.organization_id = :organizationId;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as any[];

  return {
    id: uc.project_id,
    uc_id: nativeProject.uc_id ?? uc.uc_id,
    project_title: nativeProject.project_title ?? data?.label ?? data?.attributes?.Name ?? uc.uc_id,
    owner: nativeProject.owner ?? null,
    members: [],
    start_date: nativeProject.start_date ?? data?.created ?? uc.created_at,
    ai_risk_classification: nativeProject.ai_risk_classification ?? null,
    type_of_high_risk_role: nativeProject.type_of_high_risk_role ?? null,
    goal: nativeProject.goal ?? data?.attributes?.Description ?? data?.attributes?.Purpose ?? "",
    last_updated: nativeProject.last_updated ?? data?.updated ?? uc.updated_at,
    last_updated_by: nativeProject.last_updated_by ?? null,
    is_organizational: nativeProject.is_organizational ?? false,
    framework: frameworks,
    monitored_regulations_and_standards: [],
    _source: "jira-assets",
    _jira_use_case_id: uc.id,
    _jira_data: data,
    _sync_status: uc.sync_status,
  };
}

export async function deleteUseCaseByProjectId(
  projectId: number,
  organizationId: number,
): Promise<void> {
  // Cascade deletes the jira_assets_use_cases row via FK.
  await sequelize.query(
    `DELETE FROM projects WHERE id = :projectId AND organization_id = :organizationId;`,
    { replacements: { projectId, organizationId } },
  );
}

// ---------------------------------------------------------------------------
// Sync status + history
// ---------------------------------------------------------------------------

export async function getSyncStatus(organizationId: number): Promise<any | null> {
  const rows = (await sequelize.query(
    `SELECT last_sync_at, last_sync_status, last_sync_message,
            sync_enabled, sync_interval_hours
       FROM jira_assets_config
      WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? null;
}

export async function getSyncHistory(organizationId: number, limit: number): Promise<any[]> {
  return (await sequelize.query(
    `SELECT * FROM jira_assets_sync_history
      WHERE organization_id = :organizationId
      ORDER BY started_at DESC LIMIT :limit;`,
    { replacements: { organizationId, limit }, type: QueryTypes.SELECT },
  )) as any[];
}

// ---------------------------------------------------------------------------
// Custom-frameworks progress (used by JIRA use-case Overview UI)
// ---------------------------------------------------------------------------

export async function getCustomFrameworksProgress(
  projectId: number,
  organizationId: number,
): Promise<Array<Record<string, unknown>>> {
  const tables = (await sequelize.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'verifywise' AND table_name = 'custom_frameworks' LIMIT 1;`,
    { type: QueryTypes.SELECT },
  )) as Array<{ table_name: string }>;
  if (tables.length === 0) return [];

  const frameworks = (await sequelize.query(
    `SELECT cf.id, cf.name, cf.plugin_key, cf.hierarchy_type,
            cfp.id AS project_framework_id
       FROM custom_frameworks cf
       JOIN custom_framework_projects cfp
         ON cf.id = cfp.framework_id
        AND cfp.organization_id = :organizationId
      WHERE cfp.project_id = :projectId AND cf.organization_id = :organizationId
      ORDER BY cf.name;`,
    { replacements: { projectId, organizationId }, type: QueryTypes.SELECT },
  )) as Array<{
    id: number;
    name: string;
    plugin_key: string | null;
    hierarchy_type: string;
    project_framework_id: number;
  }>;

  const results: Array<Record<string, unknown>> = [];
  for (const fw of frameworks) {
    let total = 0;
    let completed = 0;
    try {
      if (fw.hierarchy_type === "three_level") {
        const stats = (await sequelize.query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN l3.status = 'Implemented' THEN 1 ELSE 0 END)::int AS completed
             FROM custom_framework_level3_impl l3
             JOIN custom_framework_level2_impl l2
               ON l3.level2_impl_id = l2.id AND l2.organization_id = :organizationId
            WHERE l2.project_framework_id = :projectFrameworkId
              AND l3.organization_id = :organizationId;`,
          {
            replacements: {
              projectFrameworkId: fw.project_framework_id,
              organizationId,
            },
            type: QueryTypes.SELECT,
          },
        )) as Array<{ total: number; completed: number }>;
        total = stats[0]?.total ?? 0;
        completed = stats[0]?.completed ?? 0;
      } else {
        const stats = (await sequelize.query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN status = 'Implemented' THEN 1 ELSE 0 END)::int AS completed
             FROM custom_framework_level2_impl
            WHERE project_framework_id = :projectFrameworkId
              AND organization_id = :organizationId;`,
          {
            replacements: {
              projectFrameworkId: fw.project_framework_id,
              organizationId,
            },
            type: QueryTypes.SELECT,
          },
        )) as Array<{ total: number; completed: number }>;
        total = stats[0]?.total ?? 0;
        completed = stats[0]?.completed ?? 0;
      }
    } catch (err: any) {
      // Progress query is best-effort — an oddly-shaped framework shouldn't
      // 500 the whole endpoint.
      console.error(`[jira-assets] progress query failed for '${fw.name}': ${err.message}`);
    }
    results.push({
      framework_id: fw.id,
      name: fw.name,
      plugin_key: fw.plugin_key,
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    });
  }
  return results;
}
