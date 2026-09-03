import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import logger from "../../../utils/logger/fileLogger";

/**
 * Evidence Hub — daily expiry sweep.
 *
 * Flags evidence_hub records whose expiry_date has passed by setting
 * expired_at (NULL expired_at = not expired). Records with expiry_date NULL
 * are treated as "no expiry" and are never selected. Archived records are
 * left alone. Idempotent — only not-yet-flagged rows are touched; a record
 * whose expiry_date is later extended is un-flagged by the update path
 * (utils/evidenceHub.utils.ts) and becomes eligible for a fresh evaluation.
 *
 * Notification (dedup via expiry_notified_at) and soft-archival (double
 * config-gated, never a delete) hook into runEvidenceExpirySweepAllOrgs.
 */

export interface ExpiredEvidenceRecord {
  id: number;
  evidence_name: string;
  expiry_date: string;
  reviewer_id: number | null;
}

export interface EvidenceExpirySweepSummary {
  organization_id: number;
  newly_expired: number;
}

/** Flag newly expired records for one org; returns them for notification. */
export async function runEvidenceExpirySweep(
  organizationId: number,
): Promise<{ summary: EvidenceExpirySweepSummary; records: ExpiredEvidenceRecord[] }> {
  const records = (await sequelize.query(
    `UPDATE evidence_hub
        SET expired_at = now()
      WHERE organization_id = :organizationId
        AND expiry_date IS NOT NULL
        AND expiry_date < now()
        AND expired_at IS NULL
        AND archived_at IS NULL
      RETURNING id, evidence_name, expiry_date, reviewer_id`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as ExpiredEvidenceRecord[];

  return {
    summary: { organization_id: organizationId, newly_expired: records.length },
    records,
  };
}

/**
 * Sweep every org — the BullMQ daily job entry point. Isolated per org so
 * one org's failure cannot block the others (mirrors runRetentionPruneAllOrgs).
 */
export async function runEvidenceExpirySweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const { summary } = await runEvidenceExpirySweep(org.id);
      if (summary.newly_expired > 0) {
        logger.info(
          `Evidence expiry sweep org ${org.id}: newly_expired=${summary.newly_expired}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Evidence expiry sweep failed for org ${org.id}:`, error);
    }
  }
}
