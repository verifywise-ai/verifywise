"use strict";

/**
 * Add ai_action_audit_log.workflow_run_id.
 *
 * services/workflows/engine.ts has always inserted this column (and a
 * `command_id` that no reader ever wanted); the migration was never written.
 * Because logWorkflowAudit swallows its own errors so an audit failure cannot
 * abort a run, every transition raised 42703 silently and the Compliance
 * Autopilot's audit trail was empty in every environment.
 *
 * The column is the correlation key between a run and its transitions, so it
 * gets a real FK and an index rather than living in the metadata jsonb — the
 * trail is queried per run. ON DELETE CASCADE matches the table's two existing
 * FKs (organization_id, action_approval_id).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_action_audit_log
        ADD COLUMN IF NOT EXISTS workflow_run_id INTEGER
          REFERENCES verifywise.ai_workflow_runs(id) ON DELETE CASCADE;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_audit_log_workflow_run
        ON verifywise.ai_action_audit_log(workflow_run_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.idx_ai_audit_log_workflow_run;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_action_audit_log
        DROP COLUMN IF EXISTS workflow_run_id;
    `);
  },
};
