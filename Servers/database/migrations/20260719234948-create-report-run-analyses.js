"use strict";

/**
 * Phase 2 analyzers: one row per (run, section) holding the analyzer's
 * structured output. Sidecar rather than a JSONB column on report_runs so each
 * section carries its own version, model and analyzed_by — matching the two
 * sidecars the codebase already uses (evidence_ai_analysis,
 * control_readiness_scores).
 *
 * ON DELETE CASCADE: unlike report_runs.file_id, an analysis has no meaning
 * without its run.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.report_run_analyses (
        id SERIAL PRIMARY KEY,
        report_run_id INTEGER NOT NULL REFERENCES verifywise.report_runs(id) ON DELETE CASCADE,
        section_key VARCHAR(50) NOT NULL,
        organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        analysis_model VARCHAR(100),
        analysis_version INTEGER DEFAULT 1,
        analyzed_at TIMESTAMPTZ DEFAULT NOW(),
        analyzed_by INTEGER,
        audit_metadata JSONB
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_report_run_analyses_run_section_org
        ON verifywise.report_run_analyses(report_run_id, section_key, organization_id);
      CREATE INDEX IF NOT EXISTS idx_report_run_analyses_run
        ON verifywise.report_run_analyses(report_run_id, organization_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.report_run_analyses;");
  },
};
