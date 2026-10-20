"use strict";

/**
 * Jira incidents: retry the VerifyWise remote link on the Jira issue.
 *
 * jira_incident_links.remote_link_pending is true while the issue may still
 * lack the link back to the incident (set at import, cleared once Jira accepts
 * the link). remote_link_tried_at is the last failed attempt; retries take
 * never-tried links first, then the longest-waiting, so links that keep
 * failing cannot hold every retry slot.
 *
 * Existing live links are marked pending: there is no record of which ones
 * got their link, and the link is an upsert by global id, so a retry of one
 * that has it changes nothing.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.jira_incident_links
          ADD COLUMN IF NOT EXISTS remote_link_pending BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS remote_link_tried_at TIMESTAMPTZ;
      `);
      await run(`
        CREATE INDEX IF NOT EXISTS jira_incident_links_remote_link_pending_idx
          ON verifywise.jira_incident_links (organization_id, remote_link_tried_at NULLS FIRST, id)
          WHERE remote_link_pending;
      `);
      await run(`
        UPDATE verifywise.jira_incident_links SET remote_link_pending = true
         WHERE incident_id IS NOT NULL
           AND state NOT IN ('deleted_in_jira', 'deleted_in_verifywise');
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`DROP INDEX IF EXISTS verifywise.jira_incident_links_remote_link_pending_idx;`);
      await run(`
        ALTER TABLE verifywise.jira_incident_links
          DROP COLUMN IF EXISTS remote_link_tried_at,
          DROP COLUMN IF EXISTS remote_link_pending;
      `);
    });
  },
};
