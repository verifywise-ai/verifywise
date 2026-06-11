"use strict";

/**
 * Governance OS Tables Migration
 *
 * Creates tables for the Core Governance OS with Decision Intelligence:
 * - governance_control_mappings: Cross-framework control mapping relationships (shared)
 * - governance_scenarios: Pre-built and custom governance scenarios
 * - governance_scenario_rules: Scoring rules for recommendation engine
 * - governance_org_preferences: Per-organization governance settings (tenant-scoped)
 * - governance_coverage_cache: Pre-computed coverage per project (tenant-scoped)
 */

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // ========================================
      // GOVERNANCE CONTROL MAPPINGS (shared - no org_id)
      // ========================================
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.governance_control_mappings (
          id SERIAL PRIMARY KEY,
          source_framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          source_control_type VARCHAR(50) NOT NULL,
          source_control_identifier VARCHAR(100) NOT NULL,
          source_control_id INTEGER,
          target_framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          target_control_type VARCHAR(50) NOT NULL,
          target_control_identifier VARCHAR(100) NOT NULL,
          target_control_id INTEGER,
          mapping_strength VARCHAR(20) NOT NULL DEFAULT 'related',
          mapping_direction VARCHAR(20) NOT NULL DEFAULT 'bidirectional',
          domain_tag VARCHAR(100),
          rationale TEXT,
          source_reference VARCHAR(255),
          confidence_score DECIMAL(3,2) DEFAULT 0.80,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcm_source_framework ON verifywise.governance_control_mappings(source_framework_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcm_target_framework ON verifywise.governance_control_mappings(target_framework_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcm_source_control ON verifywise.governance_control_mappings(source_control_type, source_control_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcm_domain_tag ON verifywise.governance_control_mappings(domain_tag);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcm_mapping_strength ON verifywise.governance_control_mappings(mapping_strength);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcm_target_control ON verifywise.governance_control_mappings(target_control_type, target_control_id);`,
        { transaction },
      );

      // ========================================
      // GOVERNANCE SCENARIOS
      // ========================================
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.governance_scenarios (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          industry VARCHAR(100),
          use_case_type VARCHAR(100),
          region VARCHAR(100),
          recommended_framework_ids INTEGER[],
          priority_order JSONB,
          rationale TEXT,
          is_builtin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gs_org ON verifywise.governance_scenarios(organization_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gs_builtin ON verifywise.governance_scenarios(is_builtin);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gs_industry_region_use_case ON verifywise.governance_scenarios(industry, region, use_case_type);`,
        { transaction },
      );

      // ========================================
      // GOVERNANCE SCENARIO RULES
      // ========================================
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.governance_scenario_rules (
          id SERIAL PRIMARY KEY,
          scenario_id INTEGER NOT NULL REFERENCES verifywise.governance_scenarios(id) ON DELETE CASCADE,
          rule_type VARCHAR(50) NOT NULL,
          rule_operator VARCHAR(20) NOT NULL DEFAULT 'equals',
          rule_value VARCHAR(255) NOT NULL,
          weight DECIMAL(3,2) NOT NULL DEFAULT 0.50
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gsr_scenario ON verifywise.governance_scenario_rules(scenario_id);`,
        { transaction },
      );

      // ========================================
      // GOVERNANCE ORG PREFERENCES (tenant-scoped)
      // ========================================
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.governance_org_preferences (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL UNIQUE REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          selected_scenario_id INTEGER REFERENCES verifywise.governance_scenarios(id) ON DELETE SET NULL,
          custom_framework_priority JSONB,
          active_mapping_filters JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // ========================================
      // GOVERNANCE COVERAGE CACHE (tenant-scoped)
      // ========================================
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.governance_coverage_cache (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          total_controls INTEGER NOT NULL DEFAULT 0,
          mapped_controls INTEGER NOT NULL DEFAULT 0,
          coverage_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
          gap_details JSONB,
          synergy_details JSONB,
          computed_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(organization_id, project_id, framework_id)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_gcc_org_project ON verifywise.governance_coverage_cache(organization_id, project_id);`,
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
      // Drop activations first due to FK dependency on governance_scenarios
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.governance_scenario_activations;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.governance_coverage_cache;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.governance_org_preferences;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.governance_scenario_rules;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.governance_scenarios;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.governance_control_mappings;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
