"use strict";

/**
 * Report parameters and companion files.
 *
 * parameters_config on a template version declares the parameter fields a
 * report kind asks for (e.g. {"kind": "osfi_e23", "fields": [...]}).
 * report_parameters on a schedule stores the values the schedule runs with.
 * The companion_* columns on report_runs point at a second file produced by the
 * same run (for example an internal fix-it document next to the main report).
 *
 * All additions are defaulted or nullable, so existing rows keep their current
 * behaviour with no backfill.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_template_versions
        ADD COLUMN IF NOT EXISTS parameters_config JSONB NOT NULL DEFAULT '{}';
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        ADD COLUMN IF NOT EXISTS report_parameters JSONB NOT NULL DEFAULT '{}';
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        ADD COLUMN IF NOT EXISTS companion_file_id INTEGER REFERENCES verifywise.files(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS companion_filename VARCHAR(255),
        ADD COLUMN IF NOT EXISTS companion_mime_type VARCHAR(255);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_runs
        DROP COLUMN IF EXISTS companion_mime_type,
        DROP COLUMN IF EXISTS companion_filename,
        DROP COLUMN IF EXISTS companion_file_id;
    `);
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.scheduled_reports DROP COLUMN IF EXISTS report_parameters;`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.report_template_versions DROP COLUMN IF EXISTS parameters_config;`,
    );
  },
};
