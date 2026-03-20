import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { IPluginInstallation } from "../domain.layer/interfaces/i.pluginInstallation";
import { PluginInstallationStatus } from "../domain.layer/enums/plugin.enum";
import {
  ValidationException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";

/**
 * Plugin Installation Database Utilities
 * Uses raw SQL queries to interact with shared-schema plugin_installations table
 */

/**
 * Create a new plugin installation
 */
export async function createInstallation(
  plugin_key: string,
  organizationId: number
): Promise<IPluginInstallation> {
  // Validate required fields
  if (!plugin_key || plugin_key.trim().length === 0) {
    throw new ValidationException(
      "Plugin key is required",
      "plugin_key",
      plugin_key
    );
  }

  if (!organizationId || organizationId < 1) {
    throw new ValidationException(
      "Valid organization ID is required",
      "organizationId",
      organizationId
    );
  }

  try {
    // Check if plugin is already installed
    const existing = await sequelize.query(
      `SELECT * FROM plugin_installations
       WHERE plugin_key = :plugin_key AND organization_id = :organizationId
       LIMIT 1`,
      {
        replacements: { plugin_key: plugin_key.trim(), organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (existing && existing.length > 0) {
      throw new ValidationException(
        "Plugin is already installed",
        "plugin_key",
        plugin_key
      );
    }

    // Create new installation record
    const result = await sequelize.query(
      `INSERT INTO plugin_installations
       (plugin_key, organization_id, status, created_at, updated_at)
       VALUES (:plugin_key, :organizationId, :status, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          plugin_key: plugin_key.trim(),
          organizationId,
          status: PluginInstallationStatus.INSTALLED,
        },
        type: QueryTypes.INSERT,
      }
    );

    return (result[0] as any)[0] as IPluginInstallation;
  } catch (error: any) {
    if (error instanceof ValidationException) {
      throw error;
    }

    // Check if it's a Sequelize error
    if (error.name === 'SequelizeDatabaseError') {
      throw new Error(`Database error: ${error.original?.message || error.message}`);
    }

    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Find installation by plugin key
 */
export async function findByPlugin(
  plugin_key: string,
  organizationId: number
): Promise<IPluginInstallation | null> {
  const results = await sequelize.query(
    `SELECT * FROM plugin_installations
     WHERE plugin_key = :plugin_key AND organization_id = :organizationId
     LIMIT 1`,
    {
      replacements: { plugin_key: plugin_key.trim(), organizationId },
      type: QueryTypes.SELECT,
    }
  );

  return results.length > 0 ? (results[0] as IPluginInstallation) : null;
}

/**
 * Get all installed plugins for an organization
 */
export async function getInstalledPlugins(
  organizationId: number
): Promise<IPluginInstallation[]> {
  const results = await sequelize.query(
    `SELECT * FROM plugin_installations
     WHERE organization_id = :organizationId
     ORDER BY installed_at DESC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );

  return results as IPluginInstallation[];
}

/**
 * Find installation by ID
 */
export async function findById(
  id: number,
  organizationId: number
): Promise<IPluginInstallation | null> {
  if (!id || id < 1) {
    throw new ValidationException(
      "Valid installation ID is required (must be >= 1)",
      "id",
      id
    );
  }

  const results = await sequelize.query(
    `SELECT * FROM plugin_installations
     WHERE id = :id AND organization_id = :organizationId
     LIMIT 1`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.SELECT,
    }
  );

  return results.length > 0 ? (results[0] as IPluginInstallation) : null;
}

/**
 * Find installation by ID with validation
 */
export async function findByIdWithValidation(
  id: number,
  organizationId: number
): Promise<IPluginInstallation> {
  const installation = await findById(id, organizationId);

  if (!installation) {
    throw new NotFoundException("Plugin installation not found", "installation", id);
  }

  return installation;
}

/**
 * Update installation status
 */
export async function updateStatus(
  id: number,
  organizationId: number,
  status: PluginInstallationStatus
): Promise<IPluginInstallation> {
  const results = await sequelize.query(
    `UPDATE plugin_installations
     SET status = :status, installed_at = NOW(), error_message = NULL, updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId
     RETURNING *`,
    {
      replacements: { id, organizationId, status },
      type: QueryTypes.UPDATE,
    }
  );

  if (!results || !results[0] || !(results[0] as any)[0]) {
    throw new NotFoundException("Plugin installation not found after update", "installation", id);
  }

  return (results[0] as any)[0] as IPluginInstallation;
}

/**
 * Delete installation
 */
export async function deleteInstallation(
  id: number,
  organizationId: number
): Promise<void> {
  await sequelize.query(
    `DELETE FROM plugin_installations
     WHERE id = :id AND organization_id = :organizationId`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.DELETE,
    }
  );
}

/**
 * Update configuration
 */
export async function updateConfiguration(
  id: number,
  organizationId: number,
  configuration: any
): Promise<IPluginInstallation> {
  const results = await sequelize.query(
    `UPDATE plugin_installations
     SET configuration = :configuration, updated_at = NOW()
     WHERE id = :id AND organization_id = :organizationId
     RETURNING *`,
    {
      replacements: { id, organizationId, configuration: JSON.stringify(configuration) },
      type: QueryTypes.UPDATE,
    }
  );

  if (!results || !results[0] || !(results[0] as any)[0]) {
    throw new NotFoundException("Plugin installation not found after configuration update", "installation", id);
  }

  return (results[0] as any)[0] as IPluginInstallation;
}

/**
 * Convert snake_case to camelCase for frontend
 */
export function toJSON(installation: IPluginInstallation): any {
  return {
    id: installation.id,
    pluginKey: installation.plugin_key,
    status: installation.status,
    installedAt: installation.installed_at,
    uninstalledAt: installation.uninstalled_at,
    errorMessage: installation.error_message,
    configuration: installation.configuration,
    metadata: installation.metadata,
    createdAt: installation.created_at,
    updatedAt: installation.updated_at,
  };
}
