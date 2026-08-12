"use strict";

/**
 * report_runs becomes the single list of produced reports.
 *
 * archived_at/archived_by carry the manual, reversible archive action. They are
 * orthogonal to `status`: a failed run can be archived without pretending it
 * succeeded.
 *
 * The backfill copies legacy `files`-based reports — the ones the old Generate
 * tab listed via files.source — into report_runs so they do not disappear from
 * a deployment that has them. It is idempotent: the NOT EXISTS guard means a
 * second run inserts nothing.
 */
const LEGACY_SOURCES = [
  "Project risks report",
  "Compliance tracker report",
  "Assessment tracker report",
  "Reference controls group",
  "Clauses and annexes report",
  "Vendors and risks report",
  "Models and risks report",
  "Training registry report",
  "Policy manager report",
  "All reports",
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES verifywise.users(id)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_report_runs_org_archived
        ON verifywise.report_runs(organization_id, archived_at)
    `);

    await queryInterface.sequelize.query(
      `INSERT INTO verifywise.report_runs
         (organization_id, triggered_by, triggered_by_user_id, status,
          file_id, output_filename, config_snapshot, created_at, completed_at, started_at)
       SELECT f.organization_id,
              'manual',
              f.uploaded_by,
              'success',
              f.id,
              f.filename,
              jsonb_build_object('legacy', true, 'source', f.source, 'project_id', f.project_id),
              f.uploaded_time,
              f.uploaded_time,
              f.uploaded_time
       FROM verifywise.files f
       WHERE f.source IN (:legacySources)
         AND f.organization_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM verifywise.report_runs r WHERE r.file_id = f.id
         )`,
      { replacements: { legacySources: LEGACY_SOURCES } },
    );
  },

  async down(queryInterface, Sequelize) {
    // Only the rows this migration created — identified by the marker it wrote.
    await queryInterface.sequelize.query(`
      DELETE FROM verifywise.report_runs WHERE config_snapshot->>'legacy' = 'true'
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.idx_report_runs_org_archived
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP COLUMN IF EXISTS archived_at,
        DROP COLUMN IF EXISTS archived_by
    `);
  },
};
