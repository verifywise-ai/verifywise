"use strict";

/**
 * Framework selection for report templates and schedules.
 *
 * framework_config carries a template version's default target frameworks:
 *   {"frameworkIds": ["native:2", "native:3"]}
 * framework_ids carries the same list on a concrete schedule.
 *
 * Both are NULL/empty-tolerant and empty means EVERY framework in scope, so
 * existing rows keep their current behaviour with no backfill.
 *
 * The legacy scalars scheduled_reports.framework_id and project_framework_id
 * are deliberately left alone: resolveReportRequest coerces them with `?? 0`,
 * and a 0 closes all four framework gates in collectAllData.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.report_template_versions
        ADD COLUMN IF NOT EXISTS framework_config JSONB NOT NULL DEFAULT '{}';
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.scheduled_reports
        ADD COLUMN IF NOT EXISTS framework_ids JSONB;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.scheduled_reports DROP COLUMN IF EXISTS framework_ids;`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.report_template_versions DROP COLUMN IF EXISTS framework_config;`,
    );
  },
};
