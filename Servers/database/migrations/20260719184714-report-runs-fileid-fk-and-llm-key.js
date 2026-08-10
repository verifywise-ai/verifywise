"use strict";

// Phase 1 async pipeline: give report_runs.file_id a real FK so archive downloads
// resolve, but ON DELETE SET NULL so deleting a file never destroys the run's
// audit record. Add scheduled_reports.llm_key_id — read by reportRunOrchestrator
// today with no backing column (silently undefined). No FK on llm_key_id, matching
// the reporting domain's deliberate no-FK stance on cross-domain references.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        ADD COLUMN IF NOT EXISTS llm_key_id INTEGER;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP CONSTRAINT IF EXISTS report_runs_file_id_fkey;
      UPDATE verifywise.report_runs
         SET file_id = NULL
       WHERE file_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM verifywise.files f WHERE f.id = report_runs.file_id);
      ALTER TABLE verifywise.report_runs
        ADD CONSTRAINT report_runs_file_id_fkey
        FOREIGN KEY (file_id) REFERENCES verifywise.files(id) ON DELETE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP CONSTRAINT IF EXISTS report_runs_file_id_fkey;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        DROP COLUMN IF EXISTS llm_key_id;
    `);
  },
};
