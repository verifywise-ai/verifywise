'use strict';

/**
 * FRIA (Fundamental Rights Impact Assessment) Tables Migration
 *
 * Creates tables for EU AI Act Article 27 compliance:
 * - fria_assessments: Core assessment per project (versioned)
 * - fria_rights: Fundamental rights matrix (10 rights per assessment)
 * - fria_risk_items: FRIA-specific risk register
 * - fria_model_links: Links FRIA to model inventory entries
 * - fria_snapshots: Version snapshots for audit trail
 * - fria_change_history: Change tracking
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // ========================================
      // FRIA ASSESSMENTS
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.fria_assessments (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          version INTEGER NOT NULL DEFAULT 1,
          status VARCHAR(30) DEFAULT 'draft',

          -- Section 1: Organisation & system profile
          assessment_owner VARCHAR(255),
          assessment_date DATE,
          operational_context TEXT,

          -- Section 2: Applicability & scope
          is_high_risk VARCHAR(30),
          high_risk_basis VARCHAR(100),
          deployer_type VARCHAR(100),
          annex_iii_category VARCHAR(100),
          first_use_date DATE,
          review_cycle VARCHAR(50),
          period_frequency TEXT,
          fria_rationale TEXT,

          -- Section 3: Affected persons
          affected_groups TEXT,
          vulnerability_context TEXT,
          group_flags JSONB DEFAULT '[]',

          -- Section 5: Specific risks context
          risk_scenarios TEXT,
          provider_info_used TEXT,

          -- Section 6: Oversight
          human_oversight TEXT,
          transparency_measures TEXT,
          redress_process TEXT,
          data_governance TEXT,

          -- Section 7: Consultation
          legal_review VARCHAR(20),
          dpo_review VARCHAR(20),
          owner_approval VARCHAR(20),
          stakeholders_consulted TEXT,
          consultation_notes TEXT,

          -- Section 8: Summary
          deployment_decision VARCHAR(50),
          decision_conditions TEXT,

          -- Computed (cached on save)
          completion_pct INTEGER DEFAULT 0,
          risk_score INTEGER DEFAULT 0,
          risk_level VARCHAR(10) DEFAULT 'Low',
          rights_flagged INTEGER DEFAULT 0,

          -- Metadata
          created_by INTEGER NOT NULL REFERENCES verifywise.users(id),
          updated_by INTEGER REFERENCES verifywise.users(id),
          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),

          UNIQUE(project_id, version)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX idx_fria_assessments_org ON verifywise.fria_assessments(organization_id);
      `, { transaction });
      await queryInterface.sequelize.query(`
        CREATE INDEX idx_fria_assessments_project ON verifywise.fria_assessments(project_id);
      `, { transaction });

      // ========================================
      // FRIA RIGHTS (Section 4: Fundamental rights matrix)
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.fria_rights (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          fria_id INTEGER NOT NULL REFERENCES verifywise.fria_assessments(id) ON DELETE CASCADE,
          right_key VARCHAR(50) NOT NULL,
          right_title VARCHAR(255),
          charter_ref VARCHAR(100),
          flagged BOOLEAN DEFAULT FALSE,
          severity INTEGER DEFAULT 0,
          confidence INTEGER DEFAULT 0,
          impact_pathway TEXT,
          mitigation TEXT,

          UNIQUE(fria_id, right_key)
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX idx_fria_rights_fria ON verifywise.fria_rights(fria_id);
      `, { transaction });

      // ========================================
      // FRIA RISK ITEMS (Section 5: Risk register)
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.fria_risk_items (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          fria_id INTEGER NOT NULL REFERENCES verifywise.fria_assessments(id) ON DELETE CASCADE,
          risk_description TEXT NOT NULL,
          likelihood VARCHAR(10),
          severity VARCHAR(10),
          existing_controls TEXT,
          further_action TEXT,
          linked_project_risk_id INTEGER,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX idx_fria_risk_items_fria ON verifywise.fria_risk_items(fria_id);
      `, { transaction });

      // ========================================
      // FRIA MODEL LINKS
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.fria_model_links (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          fria_id INTEGER NOT NULL REFERENCES verifywise.fria_assessments(id) ON DELETE CASCADE,
          model_id INTEGER NOT NULL,

          UNIQUE(fria_id, model_id)
        );
      `, { transaction });

      // ========================================
      // FRIA SNAPSHOTS (Versioning)
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.fria_snapshots (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          fria_id INTEGER NOT NULL REFERENCES verifywise.fria_assessments(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          snapshot_data JSONB NOT NULL,
          snapshot_reason VARCHAR(255),
          created_by INTEGER NOT NULL REFERENCES verifywise.users(id),
          created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX idx_fria_snapshots_fria ON verifywise.fria_snapshots(fria_id);
      `, { transaction });

      // ========================================
      // FRIA CHANGE HISTORY
      // ========================================
      await queryInterface.sequelize.query(`
        CREATE TABLE verifywise.fria_change_history (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          fria_id INTEGER NOT NULL,
          action VARCHAR(20),
          field_name VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          changed_by_user_id INTEGER,
          changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        );
      `, { transaction });

      await queryInterface.sequelize.query(`
        CREATE INDEX idx_fria_change_history_fria ON verifywise.fria_change_history(fria_id);
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.fria_change_history;`, { transaction });
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.fria_snapshots;`, { transaction });
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.fria_model_links;`, { transaction });
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.fria_risk_items;`, { transaction });
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.fria_rights;`, { transaction });
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.fria_assessments;`, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
