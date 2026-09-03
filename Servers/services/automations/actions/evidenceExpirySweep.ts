import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { getAllUsersQuery } from "../../../utils/user.utils";
import { getEvidenceHubOrgSettings } from "../../../utils/evidenceHubSettings.utils";
import { notifyEvidenceExpired } from "../../inAppNotification.service";
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
  notified: number;
  archived: number;
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
    summary: {
      organization_id: organizationId,
      newly_expired: records.length,
      notified: 0,
      archived: 0,
    },
    records,
  };
}

const ADMIN_ROLE_ID = 1;

const formatExpiryDate = (value: unknown): string => {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(String(value));
  return isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
};

/**
 * Notify for expired-but-unnotified records in one org. Recipients: the
 * record's reviewer when set, otherwise all org admins (falling back to all
 * org users when the org has no admin — mirrors proactiveNotify). Marks
 * expiry_notified_at only after a record's notifications succeed, so a
 * failure is retried on the next daily run.
 */
async function notifyUnnotifiedExpiredEvidence(
  organizationId: number,
): Promise<number> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  const records = (await sequelize.query(
    `SELECT id, evidence_name, expiry_date, reviewer_id
       FROM evidence_hub
      WHERE organization_id = :organizationId
        AND expired_at IS NOT NULL
        AND expiry_notified_at IS NULL
        AND archived_at IS NULL
      ORDER BY id`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as ExpiredEvidenceRecord[];

  if (records.length === 0) return 0;

  const users = await getAllUsersQuery(organizationId);
  const userIds = users
    .map((u) => u.id)
    .filter((id): id is number => id !== undefined && id !== null);
  let adminIds = users
    .filter((u) => u.role_id === ADMIN_ROLE_ID)
    .map((u) => u.id)
    .filter((id): id is number => id !== undefined && id !== null);
  if (adminIds.length === 0) adminIds = userIds;

  let notified = 0;
  for (const record of records) {
    const recipientIds = record.reviewer_id ? [record.reviewer_id] : adminIds;
    try {
      for (const recipientId of recipientIds) {
        await notifyEvidenceExpired(
          organizationId,
          recipientId,
          {
            id: record.id,
            name: record.evidence_name,
            expiryDate: formatExpiryDate(record.expiry_date),
          },
          baseUrl,
        );
      }
      await sequelize.query(
        `UPDATE evidence_hub
            SET expiry_notified_at = now()
          WHERE organization_id = :organizationId AND id = :id`,
        { replacements: { organizationId, id: record.id } },
      );
      notified += 1;
    } catch (error) {
      logger.error(
        `❌ Evidence expiry notification failed for evidence ${record.id} (org ${organizationId}):`,
        error,
      );
    }
  }
  return notified;
}

/**
 * Soft-archive expired records for one org — sets archived_at only; records
 * are NEVER deleted. Double-gated: requires the environment flag
 * EVIDENCE_RETENTION_ARCHIVE_ENABLED=true AND the org's
 * evidence_hub_org_settings.archive_on_expiry=true. Both default off.
 */
async function archiveExpiredEvidence(organizationId: number): Promise<number> {
  if (process.env.EVIDENCE_RETENTION_ARCHIVE_ENABLED !== "true") return 0;

  const settings = await getEvidenceHubOrgSettings(organizationId);
  if (!settings.archive_on_expiry) return 0;

  const records = (await sequelize.query(
    `UPDATE evidence_hub
        SET archived_at = now()
      WHERE organization_id = :organizationId
        AND expired_at IS NOT NULL
        AND archived_at IS NULL
      RETURNING id`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as { id: number }[];

  return records.length;
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
      summary.notified = await notifyUnnotifiedExpiredEvidence(org.id);
      summary.archived = await archiveExpiredEvidence(org.id);
      if (summary.newly_expired > 0 || summary.notified > 0 || summary.archived > 0) {
        logger.info(
          `Evidence expiry sweep org ${org.id}: newly_expired=${summary.newly_expired} notified=${summary.notified} archived=${summary.archived}`,
        );
      }
    } catch (error) {
      logger.error(`❌ Evidence expiry sweep failed for org ${org.id}:`, error);
    }
  }
}
