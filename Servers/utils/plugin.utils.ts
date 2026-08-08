import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { IPlugin } from "../domain.layer/interfaces/i.plugin";
import { IPluginInstall } from "../domain.layer/interfaces/i.pluginInstall";
import {
  ValidationException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";

/**
 * DB access for the in-core plugin registry (`plugins` + `plugin_installs`).
 * Successor to `pluginInstallation.utils.ts` — reads plugin metadata from
 * the seeded `plugins` table instead of the external plugin-marketplace repo.
 */

// -------------------------------------------------------------------------
// Serialisation
// -------------------------------------------------------------------------

/**
 * Serialise a plugin row for HTTP responses. The frontend expects the
 * shape shipped by the legacy plugins.json (camelCase, nested `ui`).
 */
export function pluginToJSON(p: IPlugin): Record<string, any> {
  return {
    key: p.key,
    name: p.name,
    displayName: p.display_name,
    description: p.description,
    longDescription: p.long_description ?? undefined,
    version: p.version,
    author: p.author ?? undefined,
    category: p.category,
    kind: p.kind,
    region: p.region ?? undefined,
    frameworkType: p.framework_type ?? undefined,
    frameworkId: p.framework_id ?? undefined,
    iconUrl: p.icon_url ?? undefined,
    documentationUrl: p.documentation_url ?? undefined,
    supportUrl: p.support_url ?? undefined,
    isOfficial: p.is_official,
    isPublished: p.is_published,
    requiresConfiguration: p.requires_configuration,
    installationType: p.installation_type,
    features: p.features || [],
    tags: p.tags || [],
    dependencies: p.dependencies || {},
    ui: p.ui_config ?? undefined,
    entryPoint: p.entry_module ?? undefined,
  };
}

export function installToJSON(i: IPluginInstall): Record<string, any> {
  return {
    id: i.id,
    pluginKey: i.plugin_key,
    organizationId: i.organization_id,
    status: i.status,
    installedAt: i.installed_at,
    uninstalledAt: i.uninstalled_at ?? undefined,
    errorMessage: i.error_message ?? undefined,
    configuration: i.configuration || {},
    metadata: i.metadata || {},
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

// -------------------------------------------------------------------------
// Plugin registry queries
// -------------------------------------------------------------------------

export async function getAllPlugins(category?: string): Promise<IPlugin[]> {
  const where = ["is_published = TRUE"];
  const replacements: Record<string, any> = {};
  if (category) {
    where.push("category = :category");
    replacements.category = category;
  }

  const rows = (await sequelize.query(
    `SELECT * FROM plugins
      WHERE ${where.join(" AND ")}
      ORDER BY kind DESC, name ASC;`,
    { replacements, type: QueryTypes.SELECT },
  )) as IPlugin[];
  return rows;
}

export async function getPluginByKey(key: string): Promise<IPlugin | null> {
  if (!key) return null;
  const rows = (await sequelize.query(`SELECT * FROM plugins WHERE key = :key LIMIT 1;`, {
    replacements: { key },
    type: QueryTypes.SELECT,
  })) as IPlugin[];
  return rows[0] || null;
}

export async function getPluginByFrameworkId(frameworkId: number): Promise<IPlugin | null> {
  const rows = (await sequelize.query(`SELECT * FROM plugins WHERE framework_id = :fid LIMIT 1;`, {
    replacements: { fid: frameworkId },
    type: QueryTypes.SELECT,
  })) as IPlugin[];
  return rows[0] || null;
}

export async function searchPlugins(query: string): Promise<IPlugin[]> {
  const q = (query || "").trim();
  if (!q) return getAllPlugins();

  const like = `%${q.toLowerCase()}%`;
  const rows = (await sequelize.query(
    `SELECT * FROM plugins
      WHERE is_published = TRUE
        AND (
          LOWER(name) LIKE :like
          OR LOWER(description) LIKE :like
          OR EXISTS (
            SELECT 1 FROM UNNEST(tags) AS tag WHERE LOWER(tag) LIKE :like
          )
        )
      ORDER BY name ASC;`,
    { replacements: { like }, type: QueryTypes.SELECT },
  )) as IPlugin[];
  return rows;
}

export async function getCategories(): Promise<
  Array<{ id: string; name: string; description: string }>
> {
  const rows = (await sequelize.query(
    `SELECT category, COUNT(*)::int AS count
       FROM plugins WHERE is_published = TRUE
      GROUP BY category ORDER BY category ASC;`,
    { type: QueryTypes.SELECT },
  )) as Array<{ category: string; count: number }>;

  return rows.map((r) => ({
    id: r.category,
    name: r.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `${r.count} plugin${r.count === 1 ? "" : "s"}`,
  }));
}

// -------------------------------------------------------------------------
// plugin_installs queries
// -------------------------------------------------------------------------

export async function createInstall(
  pluginKey: string,
  organizationId: number,
  transaction?: Transaction,
): Promise<IPluginInstall> {
  if (!pluginKey || !pluginKey.trim()) {
    throw new ValidationException("Plugin key is required", "plugin_key", pluginKey);
  }
  if (!organizationId || organizationId < 1) {
    throw new ValidationException(
      "Valid organization ID is required",
      "organizationId",
      organizationId,
    );
  }

  const plugin = await getPluginByKey(pluginKey);
  if (!plugin) {
    throw new NotFoundException("Plugin not found in registry", "plugin", pluginKey);
  }

  const existing = (await sequelize.query(
    `SELECT 1 FROM plugin_installs
      WHERE plugin_key = :key AND organization_id = :orgId LIMIT 1;`,
    {
      replacements: { key: pluginKey, orgId: organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as unknown[];
  if (existing.length > 0) {
    throw new ValidationException("Plugin is already installed", "plugin_key", pluginKey);
  }

  const inserted = (await sequelize.query(
    `INSERT INTO plugin_installs
       (organization_id, plugin_key, status, installed_at, created_at, updated_at)
     VALUES (:orgId, :key, 'installed', NOW(), NOW(), NOW())
     RETURNING *;`,
    {
      replacements: { orgId: organizationId, key: pluginKey },
      type: QueryTypes.INSERT,
      transaction,
    },
  )) as unknown as [IPluginInstall[], number];

  return inserted[0][0];
}

export async function findInstallById(
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IPluginInstall | null> {
  if (!id || id < 1) {
    throw new ValidationException("Valid installation ID is required", "id", id);
  }
  const rows = (await sequelize.query(
    `SELECT * FROM plugin_installs
      WHERE id = :id AND organization_id = :orgId LIMIT 1;`,
    { replacements: { id, orgId: organizationId }, type: QueryTypes.SELECT, transaction },
  )) as IPluginInstall[];
  return rows[0] || null;
}

export async function findInstallByIdWithValidation(
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IPluginInstall> {
  const row = await findInstallById(id, organizationId, transaction);
  if (!row) throw new NotFoundException("Plugin installation not found", "installation", id);
  return row;
}

export async function findInstallByKey(
  pluginKey: string,
  organizationId: number,
  transaction?: Transaction,
): Promise<IPluginInstall | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM plugin_installs
      WHERE plugin_key = :key AND organization_id = :orgId LIMIT 1;`,
    {
      replacements: { key: pluginKey, orgId: organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as IPluginInstall[];
  return rows[0] || null;
}

export async function getInstalledPlugins(organizationId: number): Promise<IPluginInstall[]> {
  const rows = (await sequelize.query(
    `SELECT * FROM plugin_installs
      WHERE organization_id = :orgId AND status = 'installed'
      ORDER BY installed_at DESC;`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT },
  )) as IPluginInstall[];
  return rows;
}

export async function isPluginInstalledForOrg(
  pluginKey: string,
  organizationId: number,
): Promise<boolean> {
  const rows = (await sequelize.query(
    `SELECT 1 FROM plugin_installs
      WHERE plugin_key = :key
        AND organization_id = :orgId
        AND status = 'installed'
      LIMIT 1;`,
    { replacements: { key: pluginKey, orgId: organizationId }, type: QueryTypes.SELECT },
  )) as unknown[];
  return rows.length > 0;
}

export async function deleteInstall(
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> {
  await sequelize.query(
    `DELETE FROM plugin_installs WHERE id = :id AND organization_id = :orgId;`,
    { replacements: { id, orgId: organizationId }, type: QueryTypes.DELETE, transaction },
  );
}

export async function updateInstallConfiguration(
  id: number,
  organizationId: number,
  configuration: Record<string, any>,
  transaction?: Transaction,
): Promise<IPluginInstall> {
  const updated = (await sequelize.query(
    `UPDATE plugin_installs
        SET configuration = CAST(:config AS JSONB),
            updated_at = NOW()
      WHERE id = :id AND organization_id = :orgId
      RETURNING *;`,
    {
      replacements: { id, orgId: organizationId, config: JSON.stringify(configuration || {}) },
      type: QueryTypes.UPDATE,
      transaction,
    },
  )) as unknown as [IPluginInstall[], number];

  const rows = updated[0];
  if (!rows || rows.length === 0) {
    throw new NotFoundException("Plugin installation not found", "installation", id);
  }
  return rows[0];
}
