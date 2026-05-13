"use strict";

/**
 * Migration: Add Continuous Control Monitoring (CCM) tables
 *
 * Adds:
 * - ccm_connectors: integration connector registry
 * - ccm_control_tests: test definitions mapped to controls/subcontrols
 * - ccm_test_results: individual test execution results
 * - ccm_control_health: aggregated control health snapshots
 * - ccm_alerts: failure alerts and remediation tracking
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. ccm_connectors
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ccm_connectors (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          config JSONB NOT NULL DEFAULT '{}',
          status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
          last_tested_at TIMESTAMP WITH TIME ZONE,
          last_test_status VARCHAR(20) CHECK (last_test_status IN ('success', 'failed')),
          last_error_message TEXT,
          created_by INTEGER REFERENCES verifywise.users(id),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_connectors_org_type ON verifywise.ccm_connectors(organization_id, type);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_connectors_org_status ON verifywise.ccm_connectors(organization_id, status);`,
        { transaction },
      );

      // 2. ccm_control_tests
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ccm_control_tests (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          connector_id INTEGER NOT NULL REFERENCES verifywise.ccm_connectors(id) ON DELETE CASCADE,
          control_id INTEGER,
          subcontrol_id INTEGER,
          framework_type VARCHAR(50) NOT NULL,
          name VARCHAR(200) NOT NULL,
          test_type VARCHAR(50) NOT NULL,
          test_config JSONB NOT NULL DEFAULT '{}',
          schedule_cron VARCHAR(50) NOT NULL DEFAULT '0 * * * *',
          severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_run_at TIMESTAMP WITH TIME ZONE,
          next_run_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_control_tests_org_connector ON verifywise.ccm_control_tests(organization_id, connector_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_control_tests_org_next_run ON verifywise.ccm_control_tests(organization_id, next_run_at) WHERE is_active = TRUE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_control_tests_org_active ON verifywise.ccm_control_tests(organization_id, is_active);`,
        { transaction },
      );

      // 3. ccm_test_results
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ccm_test_results (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          test_id INTEGER NOT NULL REFERENCES verifywise.ccm_control_tests(id) ON DELETE CASCADE,
          connector_id INTEGER NOT NULL REFERENCES verifywise.ccm_connectors(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pass', 'fail', 'error', 'not_tested')),
          details_json JSONB NOT NULL DEFAULT '{}',
          evidence_file_id INTEGER REFERENCES verifywise.files(id) ON DELETE SET NULL,
          executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          duration_ms INTEGER
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_test_results_org_test_executed ON verifywise.ccm_test_results(organization_id, test_id, executed_at);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_test_results_org_status_executed ON verifywise.ccm_test_results(organization_id, status, executed_at);`,
        { transaction },
      );

      // 4. ccm_control_health
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ccm_control_health (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          control_id INTEGER NOT NULL,
          subcontrol_id INTEGER,
          framework_type VARCHAR(50) NOT NULL,
          current_status VARCHAR(20) NOT NULL DEFAULT 'not_tested' CHECK (current_status IN ('pass', 'fail', 'warning', 'not_tested')),
          last_tested_at TIMESTAMP WITH TIME ZONE,
          consecutive_passes INTEGER NOT NULL DEFAULT 0,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          UNIQUE(organization_id, control_id, subcontrol_id, framework_type)
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_control_health_org_control ON verifywise.ccm_control_health(organization_id, control_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_control_health_org_framework_status ON verifywise.ccm_control_health(organization_id, framework_type, current_status);`,
        { transaction },
      );

      // 5. ccm_alerts
      await queryInterface.sequelize.query(
        `CREATE TABLE IF NOT EXISTS verifywise.ccm_alerts (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          test_result_id INTEGER NOT NULL REFERENCES verifywise.ccm_test_results(id) ON DELETE CASCADE,
          control_id INTEGER,
          subcontrol_id INTEGER,
          severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
          status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
          assigned_to INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          message TEXT NOT NULL,
          resolved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_alerts_org_status ON verifywise.ccm_alerts(organization_id, status);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_ccm_alerts_org_assigned ON verifywise.ccm_alerts(organization_id, assigned_to);`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.ccm_alerts CASCADE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.ccm_control_health CASCADE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.ccm_test_results CASCADE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.ccm_control_tests CASCADE;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.ccm_connectors CASCADE;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
