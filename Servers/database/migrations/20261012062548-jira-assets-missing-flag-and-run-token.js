"use strict";

/**
 * Jira Assets: syncs flag missing objects instead of deleting them.
 *
 * - `jira_assets_use_cases.missing_in_jira_since`: set by a sync whose walk
 *   was complete for a linked object Jira no longer returns; cleared when the
 *   object comes back. Admins remove flagged use cases explicitly
 *   (POST /use-cases/remove-missing).
 * - `jira_assets_sync_history.run_token`: random token written at claim time.
 *   Heartbeats and finalize steps match id AND token, so a duplicate job
 *   delivery cannot co-own a run.
 * - `sync_type` gains 'remove_missing' so that removal takes the same per-org
 *   claim as syncs and imports and is recorded in the history.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_use_cases
           ADD COLUMN IF NOT EXISTS missing_in_jira_since TIMESTAMP;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history
           ADD COLUMN IF NOT EXISTS run_token VARCHAR(64);`,
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
           CHECK (sync_type IN ('manual','scheduled','import','remove_missing'));`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Removal rows cannot satisfy the narrower check; drop them first.
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.jira_assets_sync_history WHERE sync_type = 'remove_missing';`,
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
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_sync_history DROP COLUMN IF EXISTS run_token;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.jira_assets_use_cases DROP COLUMN IF EXISTS missing_in_jira_since;`,
        { transaction },
      );
    });
  },
};
