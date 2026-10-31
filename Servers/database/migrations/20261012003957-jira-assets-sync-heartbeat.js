"use strict";

/**
 * Jira Assets sync: heartbeat-based stale detection, and imports recorded in
 * the sync history.
 *
 * - `heartbeat_at` is touched while a sync runs (per fetched page and every
 *   few objects processed). A `started` row whose COALESCE(heartbeat_at,
 *   started_at) is older than 15 minutes is treated as abandoned. Nullable:
 *   rows written before this migration simply fall back to started_at.
 * - `sync_type` gains 'import' so POST /import takes the same per-org claim
 *   as manual and scheduled syncs (an import and a sync can no longer race).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history
           ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history
           DROP CONSTRAINT IF EXISTS jira_assets_sync_history_sync_type_chk;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history
           ADD CONSTRAINT jira_assets_sync_history_sync_type_chk
           CHECK (sync_type IN ('manual','scheduled','import'));`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Import rows cannot satisfy the narrower check; drop them first.
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.jira_assets_sync_history WHERE sync_type = 'import';`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history
           DROP CONSTRAINT IF EXISTS jira_assets_sync_history_sync_type_chk;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history
           ADD CONSTRAINT jira_assets_sync_history_sync_type_chk
           CHECK (sync_type IN ('manual','scheduled'));`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history DROP COLUMN IF EXISTS heartbeat_at;`,
        { transaction },
      );
    });
  },
};
