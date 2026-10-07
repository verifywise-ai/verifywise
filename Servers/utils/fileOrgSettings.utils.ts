import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import type { RetentionPolicy } from "./retention.utils";

/**
 * File org-wide settings (file_org_settings). One row per org, lazily
 * created — a missing row means defaults (no org-level default retention).
 * Follows the mrm_org_settings pattern.
 */

export interface FileOrgSettings {
  organization_id: number;
  default_retention_policy: RetentionPolicy | null;
}

export const DEFAULT_FILE_ORG_SETTINGS: Omit<FileOrgSettings, "organization_id"> = {
  default_retention_policy: null,
};

/**
 * PARTIAL update semantics: only fields present (!== undefined) change.
 * default_retention_policy may be explicitly set to null to clear the org
 * default, so it uses a "provided" flag instead of COALESCE.
 */
export interface FileOrgSettingsUpdate {
  default_retention_policy?: RetentionPolicy | null;
}

/** Read the org's file settings; a missing row resolves to defaults. */
export const getFileOrgSettings = async (organizationId: number): Promise<FileOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, default_retention_policy
       FROM file_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as FileOrgSettings[];
  return rows[0] ?? { organization_id: organizationId, ...DEFAULT_FILE_ORG_SETTINGS };
};

/**
 * Create-or-update the org's file settings row. Only fields present in
 * `update` change; absent fields keep their current value (or the column
 * default on first insert). Caller validates the values.
 */
export const upsertFileOrgSettings = async (
  organizationId: number,
  update: FileOrgSettingsUpdate,
  transaction?: Transaction,
): Promise<FileOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO file_org_settings
       (organization_id, default_retention_policy)
     VALUES
       (:organizationId, :defaultRetentionPolicy)
     ON CONFLICT (organization_id)
     DO UPDATE SET
       default_retention_policy = CASE
         WHEN :defaultRetentionProvided THEN :defaultRetentionPolicy
         ELSE file_org_settings.default_retention_policy
       END,
       updated_at = now()
     RETURNING organization_id, default_retention_policy`,
    {
      replacements: {
        organizationId,
        defaultRetentionProvided: update.default_retention_policy !== undefined,
        defaultRetentionPolicy: update.default_retention_policy ?? null,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as FileOrgSettings[];
  return rows[0];
};
