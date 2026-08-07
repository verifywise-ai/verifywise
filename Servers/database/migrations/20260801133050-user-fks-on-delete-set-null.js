"use strict";

/**
 * Make every user reference in the reporting and workflow tables ON DELETE SET NULL.
 *
 * These seven FKs were declared as bare `REFERENCES verifywise.users(id)`, which
 * is NO ACTION. deleteUserByIdQuery (utils/user.utils.ts) hard-deletes the users
 * row after nulling a hardcoded list of columns that does not include any of
 * them, so the DELETE raised 23503 and rolled back the whole transaction.
 *
 * The archive backfill in 20260728180000 copies files.uploaded_by into
 * report_runs.triggered_by_user_id for every legacy report file, so on an
 * existing install this made essentially every user who had ever generated a
 * report undeletable.
 *
 * SET NULL rather than CASCADE: losing a report run, template or workflow run
 * because its author left the company would destroy audit history. Every one of
 * these columns is already nullable. This matches the convention the schema
 * already uses for user references — files.uploaded_by
 * (20260226234301-public-schema-tables.js:488) and
 * post_market_monitoring_reports.generated_by.
 */

const FKS = [
  ["ai_workflow_runs", "started_by", "ai_workflow_runs_started_by_fkey"],
  ["report_runs", "archived_by", "report_runs_archived_by_fkey"],
  ["report_runs", "triggered_by_user_id", "report_runs_triggered_by_user_id_fkey"],
  ["report_template_versions", "created_by", "report_template_versions_created_by_fkey"],
  ["report_templates", "created_by", "report_templates_created_by_fkey"],
  ["scheduled_reports", "created_by", "scheduled_reports_created_by_fkey"],
  ["scheduled_reports", "owner_id", "scheduled_reports_owner_id_fkey"],
];

async function redeclare(queryInterface, onDelete) {
  for (const [table, column, constraint] of FKS) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.${table}
        DROP CONSTRAINT IF EXISTS ${constraint};
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.${table}
        ADD CONSTRAINT ${constraint}
        FOREIGN KEY (${column}) REFERENCES verifywise.users(id) ON DELETE ${onDelete};
    `);
  }
}

module.exports = {
  async up(queryInterface) {
    await redeclare(queryInterface, "SET NULL");
  },

  async down(queryInterface) {
    await redeclare(queryInterface, "NO ACTION");
  },
};
