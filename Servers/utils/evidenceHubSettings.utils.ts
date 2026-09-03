import { QueryTypes } from "sequelize";
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
