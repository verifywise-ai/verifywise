import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { IExtensionEnablement } from "../../interfaces/i.extension";
import { NotFoundException } from "../../exceptions/custom.exception";

/**
 * DB access for `extension_enablements`. One row per (organization, extension)
 * pair; created lazily on first enable and updated on subsequent
 * enable/disable/config-edit calls.
 */
export class ExtensionEnablementModel {
  static async findByExtensionId(
    extension_id: number,
    organization_id: number,
  ): Promise<IExtensionEnablement | null> {
    const rows = await sequelize.query(
      `SELECT * FROM extension_enablements
        WHERE organization_id = :organization_id AND extension_id = :extension_id
        LIMIT 1;`,
      { replacements: { organization_id, extension_id }, type: QueryTypes.SELECT },
    );
    return rows.length > 0 ? (rows[0] as IExtensionEnablement) : null;
  }

  static async findAllForOrg(organization_id: number): Promise<IExtensionEnablement[]> {
    return (await sequelize.query(
      `SELECT * FROM extension_enablements
        WHERE organization_id = :organization_id
        ORDER BY extension_id;`,
      { replacements: { organization_id }, type: QueryTypes.SELECT },
    )) as IExtensionEnablement[];
  }

  /**
   * Enable an extension for an org. Upserts on (organization_id, extension_id):
   * inserts with enabled=true on first call, flips enabled back to true on
   * re-enable (configuration preserved between enable/disable cycles).
   * The provided `configuration` overwrites the previous value on upsert.
   */
  static async enable(
    extension_id: number,
    organization_id: number,
    user_id: number,
    configuration: Record<string, unknown>,
  ): Promise<IExtensionEnablement> {
    const rows = await sequelize.query(
      `INSERT INTO extension_enablements
         (organization_id, extension_id, enabled, configuration, enabled_at, enabled_by,
          created_at, updated_at)
       VALUES (:organization_id, :extension_id, TRUE, CAST(:configuration AS JSONB),
               NOW(), :user_id, NOW(), NOW())
       ON CONFLICT (organization_id, extension_id) DO UPDATE
         SET enabled = TRUE,
             configuration = EXCLUDED.configuration,
             enabled_at = NOW(),
             enabled_by = EXCLUDED.enabled_by,
             updated_at = NOW()
       RETURNING *;`,
      {
        replacements: {
          organization_id,
          extension_id,
          user_id,
          configuration: JSON.stringify(configuration ?? {}),
        },
        type: QueryTypes.INSERT,
      },
    );
    return (rows[0] as any)[0] as IExtensionEnablement;
  }

  /**
   * Disable an extension for an org. Preserves `configuration` so the next
   * enable is lossless.
   */
  static async disable(
    extension_id: number,
    organization_id: number,
  ): Promise<IExtensionEnablement> {
    const rows = await sequelize.query(
      `UPDATE extension_enablements
          SET enabled = FALSE, updated_at = NOW()
        WHERE organization_id = :organization_id AND extension_id = :extension_id
      RETURNING *;`,
      {
        replacements: { organization_id, extension_id },
        type: QueryTypes.UPDATE,
      },
    );
    if (!rows || !rows[0] || !(rows[0] as any)[0]) {
      throw new NotFoundException(
        "Extension enablement not found",
        "extension_enablement",
        extension_id,
      );
    }
    return (rows[0] as any)[0] as IExtensionEnablement;
  }

  /**
   * Replace the stored configuration (encrypted secret values already merged
   * in by the caller). Fails if no enablement row exists for (org, extension).
   */
  static async updateConfiguration(
    extension_id: number,
    organization_id: number,
    configuration: Record<string, unknown>,
  ): Promise<IExtensionEnablement> {
    const rows = await sequelize.query(
      `UPDATE extension_enablements
          SET configuration = CAST(:configuration AS JSONB), updated_at = NOW()
        WHERE organization_id = :organization_id AND extension_id = :extension_id
      RETURNING *;`,
      {
        replacements: {
          organization_id,
          extension_id,
          configuration: JSON.stringify(configuration ?? {}),
        },
        type: QueryTypes.UPDATE,
      },
    );
    if (!rows || !rows[0] || !(rows[0] as any)[0]) {
      throw new NotFoundException(
        "Extension enablement not found",
        "extension_enablement",
        extension_id,
      );
    }
    return (rows[0] as any)[0] as IExtensionEnablement;
  }

  static toJSON(ee: IExtensionEnablement): Record<string, unknown> {
    return {
      id: ee.id,
      organizationId: ee.organization_id,
      extensionId: ee.extension_id,
      enabled: ee.enabled,
      configuration: ee.configuration,
      enabledAt: ee.enabled_at,
      enabledBy: ee.enabled_by,
      createdAt: ee.created_at,
      updatedAt: ee.updated_at,
    };
  }
}
