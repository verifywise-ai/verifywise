import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";
import { notifyFileExpiring } from "../../inAppNotification.service";
import logger from "../../../utils/logger/fileLogger";

/**
 * Files — daily expiry sweep.
 *
 * Selects every file whose expiry_date is within the 7-day window
 * (T-6 through T-0) and notifies its uploader. The window itself is the
 * dedup — no state column is written back, so a re-run inside the same
 * day re-notifies (accepted for simplicity per the design; missed days
 * are missed notifications, no catch-up).
 *
 * Post-expiry (T+1 onward) is intentionally silent — the frontend shows
 * an "Expired" badge on files past expiry_date; the sweep stops nagging.
 *
 * files with NULL expiry_date, NULL uploaded_by, or expiry_date outside
 * the window are skipped entirely.
 */

const NOTIFY_WINDOW_DAYS = 6; // T-6 through T-0 → 7 daily notifications

export interface ExpiringFileRow {
  id: number;
  filename: string;
  uploaded_by: number;
  expiry_date: string;
  days_remaining: number;
}

export interface FileExpirySweepSummary {
  organization_id: number;
  candidates: number;
  notified: number;
}

/** Notify uploaders for one org; returns summary + rows for observability. */
export async function runFileExpirySweep(
  organizationId: number,
): Promise<{ summary: FileExpirySweepSummary; rows: ExpiringFileRow[] }> {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

  const rows = (await sequelize.query(
    `SELECT id,
            filename,
            uploaded_by,
            expiry_date,
            (expiry_date - CURRENT_DATE)::int AS days_remaining
       FROM files
      WHERE organization_id = :organizationId
        AND expiry_date IS NOT NULL
        AND uploaded_by IS NOT NULL
        AND (expiry_date - CURRENT_DATE) BETWEEN 0 AND :windowDays
      ORDER BY expiry_date ASC, id ASC`,
    {
      replacements: { organizationId, windowDays: NOTIFY_WINDOW_DAYS },
      type: QueryTypes.SELECT,
    },
  )) as ExpiringFileRow[];

  let notified = 0;
  for (const row of rows) {
    try {
      await notifyFileExpiring(
        organizationId,
        row.uploaded_by,
        {
          id: row.id,
          name: row.filename,
          expiryDate: formatExpiryDate(row.expiry_date),
          daysRemaining: row.days_remaining,
        },
        baseUrl,
      );
      notified += 1;
    } catch (error) {
      logger.error(
        `❌ File expiry notification failed for file ${row.id} (org ${organizationId}):`,
        error,
      );
    }
  }

  return {
    summary: {
      organization_id: organizationId,
      candidates: rows.length,
      notified,
    },
    rows,
  };
}

const formatExpiryDate = (value: unknown): string => {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(String(value));
  return isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
};

/**
 * Sweep every org — the BullMQ daily job entry point. Isolated per org so
 * one org's failure cannot block the others (mirrors runRetentionPruneAllOrgs).
 */
export async function runFileExpirySweepAllOrgs(): Promise<void> {
  const organizations = await getAllOrganizationsQuery();
  for (const org of organizations) {
    if (org.id === undefined || org.id === null) continue;
    try {
      const { summary } = await runFileExpirySweep(org.id);
      if (summary.candidates > 0 || summary.notified > 0) {
        logger.info(
          `File expiry sweep org ${org.id}: candidates=${summary.candidates} notified=${summary.notified}`,
        );
      }
    } catch (error) {
      logger.error(`❌ File expiry sweep failed for org ${org.id}:`, error);
    }
  }
}
