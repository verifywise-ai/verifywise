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

/**
 * Get all organization IDs that have shadow AI data.
 */
async function getAllOrganizationIds(): Promise<number[]> {
  const [rows] = await sequelize.query(
    `SELECT DISTINCT organization_id
     FROM shadow_ai_events
     ORDER BY organization_id`
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
      await sequelize.query(`
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
      `, { replacements: { organizationId } });

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
      await sequelize.query(`
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
      `, { replacements: { organizationId } });

      logger.debug(`✅ Monthly rollup completed for organization ${organizationId}`);
    } catch (error) {
      logger.error(`❌ Monthly rollup failed for organization ${organizationId}:`, error);
    }
  }
}

/**
 * Purge old data based on per-organization retention settings.
 * Deletes raw events, daily rollups, and alert history older than configured days.
 * A value of 0 means keep data indefinitely (no purge).
 * Runs at 2:00 AM daily.
 */
export async function purgeOldEvents(): Promise<void> {
  const orgIds = await getAllOrganizationIds();
  logger.debug(`🔄 Running data retention cleanup for ${orgIds.length} organizations`);

  for (const organizationId of orgIds) {
    try {
      const settings = await getSettingsQuery(organizationId);

      // Purge raw events
      if (settings.retention_events_days > 0) {
        const [, eventCount] = await sequelize.query(
          `DELETE FROM shadow_ai_events
           WHERE organization_id = :organizationId
             AND event_timestamp < NOW() - INTERVAL '1 day' * :days`,
          { replacements: { organizationId, days: settings.retention_events_days } }
        );
        if ((eventCount as number) > 0) {
          logger.debug(`✅ Purged ${eventCount} events older than ${settings.retention_events_days}d for organization ${organizationId}`);
        }
      }

      // Purge daily rollups
      if (settings.retention_daily_rollups_days > 0) {
        const [, rollupCount] = await sequelize.query(
          `DELETE FROM shadow_ai_daily_rollups
           WHERE organization_id = :organizationId
             AND rollup_date < NOW() - INTERVAL '1 day' * :days`,
          { replacements: { organizationId, days: settings.retention_daily_rollups_days } }
        );
        if ((rollupCount as number) > 0) {
          logger.debug(`✅ Purged ${rollupCount} daily rollups older than ${settings.retention_daily_rollups_days}d for organization ${organizationId}`);
        }
      }

      // Purge alert history
      if (settings.retention_alert_history_days > 0) {
        const [, alertCount] = await sequelize.query(
          `DELETE FROM shadow_ai_alert_history
           WHERE organization_id = :organizationId
             AND fired_at < NOW() - INTERVAL '1 day' * :days`,
          { replacements: { organizationId, days: settings.retention_alert_history_days } }
        );
        if ((alertCount as number) > 0) {
          logger.debug(`✅ Purged ${alertCount} alert records older than ${settings.retention_alert_history_days}d for organization ${organizationId}`);
        }
      }
    } catch (error) {
      logger.error(`❌ Data retention cleanup failed for organization ${organizationId}:`, error);
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
