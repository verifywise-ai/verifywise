/**
 * Shadow AI Aggregation Service
 *
 * Business logic for scheduled aggregation jobs:
 * - Daily rollup: aggregate yesterday's raw events
 * - Monthly rollup: aggregate last month's daily rollups
 * - Purge old events: delete events older than 30 days
 * - Nightly risk scoring: recalculate all tool risk scores
 *
 * Called by BullMQ worker handlers.
 */

import { sequelize } from "../database/db";
import logger from "../utils/logger/fileLogger";
import { calculateRiskScoresForOrganization } from "./shadowAiRiskScoring.service";
import { getSettingsQuery } from "../utils/shadowAiConfig.utils";
import { safeRecordRetentionRun, type RetentionRecordType } from "../utils/dataRetention.utils";

/**
 * Get all organization IDs that have shadow AI data.
 */
async function getAllOrganizationIds(): Promise<number[]> {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT organization_id
     FROM shadow_ai_events
     ORDER BY organization_id`,
  );

  return (rows as any[]).map((r) => r.organization_id);
}

/**
 * Daily rollup: Aggregate yesterday's raw events into daily rollups.
 * Runs at 1:00 AM daily.
 */
export async function runDailyRollup(): Promise<void> {
  const orgIds = await getAllOrganizationIds();
  logger.debug(`🔄 Running shadow AI daily rollup for ${orgIds.length} organizations`);

  for (const organizationId of orgIds) {
    try {
      await sequelize.query(
        `
        INSERT INTO shadow_ai_daily_rollups
          (organization_id, rollup_date, user_email, tool_id, department, total_events, post_events, blocked_events)
        SELECT
          :organizationId,
          DATE(event_timestamp) as rollup_date,
          user_email,
          detected_tool_id as tool_id,
          department,
          COUNT(*) as total_events,
          COUNT(CASE WHEN http_method = 'POST' THEN 1 END) as post_events,
          COUNT(CASE WHEN action = 'blocked' THEN 1 END) as blocked_events
        FROM shadow_ai_events
        WHERE organization_id = :organizationId
          AND DATE(event_timestamp) = CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(event_timestamp), user_email, detected_tool_id, department
        ON CONFLICT (organization_id, rollup_date, user_email, tool_id) DO UPDATE SET
          total_events = EXCLUDED.total_events,
          post_events = EXCLUDED.post_events,
          blocked_events = EXCLUDED.blocked_events
      `,
        { replacements: { organizationId } },
      );

      logger.debug(`✅ Daily rollup completed for organization ${organizationId}`);
    } catch (error) {
      logger.error(`❌ Daily rollup failed for organization ${organizationId}:`, error);
    }
  }
}

/**
 * Monthly rollup: Aggregate last month's daily rollups into monthly rollups.
 * Runs at 1:00 AM on the 1st of each month.
 */
export async function runMonthlyRollup(): Promise<void> {
  const orgIds = await getAllOrganizationIds();
  logger.debug(`🔄 Running shadow AI monthly rollup for ${orgIds.length} organizations`);

  for (const organizationId of orgIds) {
    try {
      await sequelize.query(
        `
        INSERT INTO shadow_ai_monthly_rollups
          (organization_id, rollup_month, tool_id, department, unique_users, total_events, post_events, blocked_events)
        SELECT
          :organizationId,
          DATE_TRUNC('month', rollup_date) as rollup_month,
          tool_id,
          department,
          COUNT(DISTINCT user_email) as unique_users,
          SUM(total_events) as total_events,
          SUM(post_events) as post_events,
          SUM(blocked_events) as blocked_events
        FROM shadow_ai_daily_rollups
        WHERE organization_id = :organizationId
          AND rollup_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
          AND rollup_date < DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY DATE_TRUNC('month', rollup_date), tool_id, department
        ON CONFLICT (organization_id, rollup_month, tool_id, department) DO UPDATE SET
          unique_users = EXCLUDED.unique_users,
          total_events = EXCLUDED.total_events,
          post_events = EXCLUDED.post_events,
          blocked_events = EXCLUDED.blocked_events
      `,
        { replacements: { organizationId } },
      );

      logger.debug(`✅ Monthly rollup completed for organization ${organizationId}`);
    } catch (error) {
      logger.error(`❌ Monthly rollup failed for organization ${organizationId}:`, error);
    }
  }
}

/** The three Shadow AI cleanups. Table and column names come only from this list. */
const SHADOW_AI_PURGES: ReadonlyArray<{
  recordType: RetentionRecordType;
  setting:
    "retention_events_days" | "retention_daily_rollups_days" | "retention_alert_history_days";
  table: string;
  timestampColumn: string;
  label: string;
}> = [
  {
    recordType: "shadow_ai_events",
    setting: "retention_events_days",
    table: "shadow_ai_events",
    timestampColumn: "event_timestamp",
    label: "events",
  },
  {
    recordType: "shadow_ai_daily_rollups",
    setting: "retention_daily_rollups_days",
    table: "shadow_ai_daily_rollups",
    timestampColumn: "rollup_date",
    label: "daily rollups",
  },
  {
    recordType: "shadow_ai_alert_history",
    setting: "retention_alert_history_days",
    table: "shadow_ai_alert_history",
    timestampColumn: "fired_at",
    label: "alert records",
  },
];

/**
 * Purge old data based on per-organization retention settings.
 * Deletes raw events, daily rollups, and alert history older than configured days.
 * A value of 0 means keep data indefinitely (no purge).
 * Each cleanup records its own run; a failing one records a failed run and
 * the others still run.
 * Runs at 2:00 AM daily.
 */
export async function purgeOldEvents(): Promise<void> {
  const orgIds = await getAllOrganizationIds();
  logger.debug(`🔄 Running data retention cleanup for ${orgIds.length} organizations`);

  for (const organizationId of orgIds) {
    let settings: Awaited<ReturnType<typeof getSettingsQuery>>;
    try {
      settings = await getSettingsQuery(organizationId);
    } catch (error) {
      // Without the settings there are no periods: record a failed run (with
      // no cutoff) for each cleanup so the failure shows on the settings page.
      logger.error(`❌ Data retention cleanup failed for organization ${organizationId}:`, error);
      for (const purge of SHADOW_AI_PURGES) {
        await safeRecordRetentionRun({
          organizationId,
          recordType: purge.recordType,
          cutoff: null,
          deletedCount: 0,
          status: "failed",
          error,
        });
      }
      continue;
    }

    for (const purge of SHADOW_AI_PURGES) {
      const days = settings[purge.setting];
      if (!(days > 0)) continue;
      try {
        // The cutoff is computed once, in the database, and the run record
        // stores exactly the value the DELETE used.
        const [rows] = await sequelize.query(
          `WITH params AS (
             SELECT NOW() - INTERVAL '1 day' * :days AS cutoff
           ),
           removed AS (
             DELETE FROM ${purge.table} t
             USING params
             WHERE t.organization_id = :organizationId
               AND t.${purge.timestampColumn} < params.cutoff
             RETURNING 1
           )
           SELECT (SELECT cutoff::text FROM params) AS cutoff,
                  (SELECT COUNT(*) FROM removed)::int AS deleted_count`,
          { replacements: { organizationId, days } },
        );
        const result = (rows as { cutoff: string; deleted_count: number }[])[0];
        const deleted = Number(result?.deleted_count ?? 0);
        await safeRecordRetentionRun({
          organizationId,
          recordType: purge.recordType,
          cutoff: result?.cutoff ?? null,
          deletedCount: deleted,
          status: "success",
        });
        if (deleted > 0) {
          logger.debug(
            `✅ Purged ${deleted} ${purge.label} older than ${days}d for organization ${organizationId}`,
          );
        }
      } catch (error) {
        logger.error(
          `❌ Data retention cleanup failed for organization ${organizationId} (${purge.table}):`,
          error,
        );
        // The statement failed, so it produced no cutoff to record.
        await safeRecordRetentionRun({
          organizationId,
          recordType: purge.recordType,
          cutoff: null,
          deletedCount: 0,
          status: "failed",
          error,
        });
      }
    }
  }
}

/**
 * Nightly risk scoring: Recalculate risk scores for all tools across all organizations.
 * Runs at 1:30 AM daily.
 */
export async function runNightlyRiskScoring(): Promise<void> {
  const orgIds = await getAllOrganizationIds();
  logger.debug(`🔄 Running nightly risk scoring for ${orgIds.length} organizations`);

  for (const organizationId of orgIds) {
    try {
      await calculateRiskScoresForOrganization(organizationId);
      logger.debug(`✅ Risk scoring completed for organization ${organizationId}`);
    } catch (error) {
      logger.error(`❌ Risk scoring failed for organization ${organizationId}:`, error);
    }
  }
}
