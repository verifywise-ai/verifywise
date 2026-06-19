"use strict";

// Enterprise Reporting MVP — template-first reporting domain.
module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.report_templates (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(50) NOT NULL,
          default_scope VARCHAR(20) NOT NULL,
          supported_scopes JSONB NOT NULL DEFAULT '["project","organization"]',
          recommended_frequency VARCHAR(20),
          is_system_template BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_by INTEGER REFERENCES verifywise.users(id),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );`, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.report_template_versions (
          id SERIAL PRIMARY KEY,
          template_id INTEGER NOT NULL REFERENCES verifywise.report_templates(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          sections_config JSONB NOT NULL DEFAULT '{}',
          ai_blocks_config JSONB NOT NULL DEFAULT '{}',
          format_config JSONB NOT NULL DEFAULT '{}',
          branding_config JSONB NOT NULL DEFAULT '{}',
          schedule_defaults JSONB NOT NULL DEFAULT '{}',
          delivery_defaults JSONB NOT NULL DEFAULT '{}',
          config_schema_version INTEGER NOT NULL DEFAULT 1,
          created_by INTEGER REFERENCES verifywise.users(id),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );`, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.scheduled_reports (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          template_id INTEGER NOT NULL REFERENCES verifywise.report_templates(id),
          template_version_id INTEGER NOT NULL REFERENCES verifywise.report_template_versions(id),
          name VARCHAR(255) NOT NULL,
          scope VARCHAR(20) NOT NULL,
          project_id INTEGER,
          framework_id INTEGER,
          project_framework_id INTEGER,
          sections_config JSONB NOT NULL DEFAULT '{}',
          ai_blocks_config JSONB NOT NULL DEFAULT '{}',
          format VARCHAR(10) NOT NULL DEFAULT 'pdf',
          schedule_config JSONB NOT NULL DEFAULT '{}',
          delivery_config JSONB NOT NULL DEFAULT '{}',
          is_active BOOLEAN NOT NULL DEFAULT true,
          owner_id INTEGER REFERENCES verifywise.users(id),
          created_by INTEGER REFERENCES verifywise.users(id),
          last_run_at TIMESTAMPTZ,
          next_run_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );`, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.report_runs (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          scheduled_report_id INTEGER REFERENCES verifywise.scheduled_reports(id) ON DELETE SET NULL,
          template_id INTEGER,
          template_version_id INTEGER,
          triggered_by VARCHAR(20) NOT NULL,
          triggered_by_user_id INTEGER REFERENCES verifywise.users(id),
          status VARCHAR(20) NOT NULL DEFAULT 'queued',
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          file_id INTEGER,
          output_filename VARCHAR(255),
          output_mime_type VARCHAR(100),
          config_snapshot JSONB,
          delivery_status JSONB,
          ai_status JSONB,
          ai_tokens_used INTEGER,
          ai_cost NUMERIC(12,4),
          duration_ms INTEGER,
          scheduled_for TIMESTAMPTZ,
          error_message TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );`, { transaction: t });

      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_report_templates_org ON verifywise.report_templates(organization_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tpl_versions_unique ON verifywise.report_template_versions(template_id, version);
        CREATE INDEX IF NOT EXISTS idx_sched_reports_org ON verifywise.scheduled_reports(organization_id);
        CREATE INDEX IF NOT EXISTS idx_sched_reports_due ON verifywise.scheduled_reports(is_active, next_run_at);
        CREATE INDEX IF NOT EXISTS idx_report_runs_org ON verifywise.report_runs(organization_id);
        CREATE INDEX IF NOT EXISTS idx_report_runs_sched ON verifywise.report_runs(scheduled_report_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_report_runs_dedupe ON verifywise.report_runs(scheduled_report_id, scheduled_for) WHERE scheduled_report_id IS NOT NULL AND scheduled_for IS NOT NULL;
      `, { transaction: t });

      await t.commit();
    } catch (e) { await t.rollback(); throw e; }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.report_runs;
      DROP TABLE IF EXISTS verifywise.scheduled_reports;
      DROP TABLE IF EXISTS verifywise.report_template_versions;
      DROP TABLE IF EXISTS verifywise.report_templates;
    `);
  },
};
