import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";

/**
 * Evidence Hub org-wide settings (evidence_hub_org_settings). One row per
 * org, lazily created — a missing row means defaults. Follows the
 * mrm_org_settings pattern (see utils/mrmSettings.utils.ts).
 */

export interface EvidenceHubOrgSettings {
  organization_id: number;
  default_retention_period: string | null;
  archive_on_expiry: boolean;
}

export const DEFAULT_EVIDENCE_HUB_ORG_SETTINGS: Omit<
  EvidenceHubOrgSettings,
  "organization_id"
> = {
  default_retention_period: null, // no org-level default retention
  archive_on_expiry: false, // archival is opt-in, never on by default
};

/**
 * PARTIAL update semantics: only fields present (!== undefined) change.
 * default_retention_period may be explicitly set to null to clear the org
 * default, so it uses a "provided" flag instead of COALESCE.
 */
export interface EvidenceHubOrgSettingsUpdate {
  default_retention_period?: string | null;
  archive_on_expiry?: boolean;
}

/** Read the org's Evidence Hub settings; a missing row resolves to defaults. */
export const getEvidenceHubOrgSettings = async (
  organizationId: number,
): Promise<EvidenceHubOrgSettings> => {
  const rows = (await sequelize.query(
    `SELECT organization_id, default_retention_period, archive_on_expiry
       FROM evidence_hub_org_settings
      WHERE organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as EvidenceHubOrgSettings[];
  return rows[0] ?? { organization_id: organizationId, ...DEFAULT_EVIDENCE_HUB_ORG_SETTINGS };
};

/**
 * Create-or-update the org's Evidence Hub settings row. Only fields present
 * in `update` change; absent fields keep their current value (or the column
 * default on first insert). Caller validates the values.
 */
export const upsertEvidenceHubOrgSettings = async (
  organizationId: number,
  update: EvidenceHubOrgSettingsUpdate,
  transaction?: Transaction,
): Promise<EvidenceHubOrgSettings> => {
  const rows = (await sequelize.query(
    `INSERT INTO evidence_hub_org_settings
       (organization_id, default_retention_period, archive_on_expiry)
     VALUES
       (:organizationId,
        :defaultRetentionPeriod,
        COALESCE(:archiveOnExpiry, false))
     ON CONFLICT (organization_id)
     DO UPDATE SET
       default_retention_period = CASE
         WHEN :defaultRetentionProvided THEN :defaultRetentionPeriod
         ELSE evidence_hub_org_settings.default_retention_period
       END,
       archive_on_expiry = COALESCE(:archiveOnExpiry, evidence_hub_org_settings.archive_on_expiry),
       updated_at = now()
     RETURNING organization_id, default_retention_period, archive_on_expiry`,
    {
      replacements: {
        organizationId,
        defaultRetentionProvided: update.default_retention_period !== undefined,
        defaultRetentionPeriod: update.default_retention_period ?? null,
        archiveOnExpiry: update.archive_on_expiry ?? null,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as EvidenceHubOrgSettings[];
  return rows[0];
};
