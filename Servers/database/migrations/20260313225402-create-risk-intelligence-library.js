'use strict';

/**
 * Migration: Create Risk Intelligence Library Tables
 *
 * Creates 6 tables for the Risk Intelligence Library feature:
 * - risk_library_entries: Core risk scenarios with multi-dimensional taxonomy
 * - risk_library_mitigations: Mitigations as first-class entities linked to risks
 * - risk_library_incidents: Real-world incident references linked to risks
 * - risk_library_org_customizations: Org-specific overrides (tenant-scoped)
 * - risk_library_feedback: User upvote/downvote/flag per entry (tenant-scoped)
 * - risk_library_generations: Tracks AI-generated content per org (tenant-scoped)
 *
 * Taxonomy dimensions inspired by:
 * - Saidot: 11 risk types, 7 risk sources, control catalogue pattern
 * - MIT AI Risk Repository: 7 domains, 23 subcategories, dual taxonomy
 * - EU AI Act: 4 risk tiers
 * - IBM Risk Atlas: risk-to-mitigation pairing with framework references
 * - AIID: real-world incident linking
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🚀 Creating Risk Intelligence Library tables...');

      // Helper: Create index if not exists
      const createIndex = async (indexName, tableName, columns) => {
        await queryInterface.sequelize.query(
          `CREATE INDEX IF NOT EXISTS ${indexName} ON verifywise.${tableName}(${columns});`,
          { transaction }
        );
      };

      // ========================================
      // 1. RISK LIBRARY ENTRIES (shared base, no org_id)
      // ========================================
      console.log('📋 Creating risk_library_entries table...');
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.risk_library_entries (
          id SERIAL PRIMARY KEY,
          source VARCHAR(50) NOT NULL,
          source_id VARCHAR(100),
          summary VARCHAR(500) NOT NULL,
          description TEXT NOT NULL,

          -- Multi-dimensional taxonomy
          risk_type VARCHAR(50),
          risk_source VARCHAR(50),
          domain VARCHAR(100),
          subdomain VARCHAR(100),
          eu_ai_act_tier VARCHAR(20),
          risk_category TEXT,

          -- Assessment defaults
          severity VARCHAR(50),
          likelihood VARCHAR(50),
          marginal_risk_description TEXT,

          -- Context
          industry VARCHAR(255),
          use_case VARCHAR(255),
          ai_lifecycle_phase VARCHAR(100),
          applicable_model_types TEXT[],

          tags TEXT[],
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),

          UNIQUE(source, source_id)
        );
      `, { transaction });

      // Indexes for risk_library_entries
      await createIndex('idx_rle_source', 'risk_library_entries', 'source');
      await createIndex('idx_rle_risk_type', 'risk_library_entries', 'risk_type');
      await createIndex('idx_rle_risk_source', 'risk_library_entries', 'risk_source');
      await createIndex('idx_rle_domain', 'risk_library_entries', 'domain');
      await createIndex('idx_rle_eu_ai_act_tier', 'risk_library_entries', 'eu_ai_act_tier');
      await createIndex('idx_rle_industry', 'risk_library_entries', 'industry');
      await createIndex('idx_rle_severity', 'risk_library_entries', 'severity');
      await createIndex('idx_rle_lifecycle', 'risk_library_entries', 'ai_lifecycle_phase');

      // Full-text search index
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_rle_fts
        ON verifywise.risk_library_entries
        USING GIN(to_tsvector('english', COALESCE(summary, '') || ' ' || COALESCE(description, '')));
      `, { transaction });

      // ========================================
      // 2. RISK LIBRARY MITIGATIONS (shared base, no org_id)
      // ========================================
      console.log('📋 Creating risk_library_mitigations table...');
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.risk_library_mitigations (
          id SERIAL PRIMARY KEY,
          risk_entry_id INTEGER NOT NULL REFERENCES verifywise.risk_library_entries(id) ON DELETE CASCADE,
          strategy VARCHAR(20) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          implementation_guidance TEXT,
          evidence_requirements TEXT,
          source VARCHAR(50),
          framework_ref VARCHAR(100),
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
      `, { transaction });

      await createIndex('idx_rlm_risk_entry', 'risk_library_mitigations', 'risk_entry_id');
      await createIndex('idx_rlm_strategy', 'risk_library_mitigations', 'strategy');

      // ========================================
      // 3. RISK LIBRARY INCIDENTS (shared base, no org_id)
      // ========================================
      console.log('📋 Creating risk_library_incidents table...');
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.risk_library_incidents (
          id SERIAL PRIMARY KEY,
          risk_entry_id INTEGER NOT NULL REFERENCES verifywise.risk_library_entries(id) ON DELETE CASCADE,
          incident_title VARCHAR(500) NOT NULL,
          incident_description TEXT,
          incident_date DATE,
          source_url VARCHAR(1000),
          source_db VARCHAR(50),
          source_incident_id VARCHAR(100),
          harm_type VARCHAR(100),
          sector VARCHAR(100),
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
      `, { transaction });

      await createIndex('idx_rli_risk_entry', 'risk_library_incidents', 'risk_entry_id');

      // ========================================
      // 4. RISK LIBRARY ORG CUSTOMIZATIONS (tenant-scoped)
      // ========================================
      console.log('📋 Creating risk_library_org_customizations table...');
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.risk_library_org_customizations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          library_entry_id INTEGER NOT NULL REFERENCES verifywise.risk_library_entries(id) ON DELETE CASCADE,
          custom_mitigations TEXT,
          custom_notes TEXT,
          is_hidden BOOLEAN NOT NULL DEFAULT false,
          relevance_score REAL,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
          UNIQUE(organization_id, library_entry_id)
        );
      `, { transaction });

      await createIndex('idx_rloc_org', 'risk_library_org_customizations', 'organization_id');
      await createIndex('idx_rloc_entry', 'risk_library_org_customizations', 'library_entry_id');

      // ========================================
      // 5. RISK LIBRARY FEEDBACK (tenant-scoped)
      // ========================================
      console.log('📋 Creating risk_library_feedback table...');
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.risk_library_feedback (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          library_entry_id INTEGER REFERENCES verifywise.risk_library_entries(id) ON DELETE SET NULL,
          user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
          feedback_type VARCHAR(20) NOT NULL,
          flag_reason TEXT,
          context TEXT,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
          UNIQUE(organization_id, user_id, library_entry_id)
        );
      `, { transaction });

      await createIndex('idx_rlf_org', 'risk_library_feedback', 'organization_id');
      await createIndex('idx_rlf_entry', 'risk_library_feedback', 'library_entry_id');
      await createIndex('idx_rlf_user', 'risk_library_feedback', 'user_id');

      // ========================================
      // 6. RISK LIBRARY GENERATIONS (tenant-scoped)
      // ========================================
      console.log('📋 Creating risk_library_generations table...');
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.risk_library_generations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES verifywise.users(id) ON DELETE CASCADE,
          generation_type VARCHAR(50) NOT NULL,
          input_context TEXT NOT NULL,
          output_content TEXT NOT NULL,
          llm_provider VARCHAR(50),
          llm_model VARCHAR(100),
          feedback_type VARCHAR(20),
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
      `, { transaction });

      await createIndex('idx_rlg_org', 'risk_library_generations', 'organization_id');
      await createIndex('idx_rlg_user', 'risk_library_generations', 'user_id');
      await createIndex('idx_rlg_type', 'risk_library_generations', 'generation_type');

      await transaction.commit();
      console.log('✅ Risk Intelligence Library tables created successfully.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Dropping Risk Intelligence Library tables...');

      // Drop in reverse dependency order
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.risk_library_generations CASCADE;', { transaction });
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.risk_library_feedback CASCADE;', { transaction });
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.risk_library_org_customizations CASCADE;', { transaction });
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.risk_library_incidents CASCADE;', { transaction });
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.risk_library_mitigations CASCADE;', { transaction });
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS verifywise.risk_library_entries CASCADE;', { transaction });

      await transaction.commit();
      console.log('✅ Risk Intelligence Library tables dropped successfully.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
