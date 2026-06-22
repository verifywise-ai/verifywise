"use strict";

/**
 * Phase 0 — Shared Infrastructure
 *
 * Creates 4 tables required by all Phase 0 AI features:
 *   1. evidence_ai_analysis       — P0-1: Evidence Agent
 *   2. control_readiness_scores   — P0-2: Control Assessment Agent
 *   3. framework_readiness_scores — P0-2: Control Assessment Agent
 *   4. ai_content_metadata        — P0-3: AI-Generated Content Badge
 */
module.exports = {
  async up(queryInterface) {
    // 1. evidence_ai_analysis
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.evidence_ai_analysis (
        id SERIAL PRIMARY KEY,
        file_id INTEGER NOT NULL,
        summary TEXT,
        key_findings JSONB,
        compliance_areas JSONB,
        quality_score JSONB,
        overall_quality_score INTEGER,
        suggested_control_links JSONB,
        analysis_model VARCHAR(100),
        analysis_version INTEGER DEFAULT 1,
        analyzed_at TIMESTAMPTZ DEFAULT NOW(),
        analyzed_by INTEGER,
        organization_id INTEGER NOT NULL
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_evidence_ai_file
        ON verifywise.evidence_ai_analysis(file_id, organization_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_ai_quality
        ON verifywise.evidence_ai_analysis(overall_quality_score, organization_id);
    `);

    // 2. control_readiness_scores
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.control_readiness_scores (
        id SERIAL PRIMARY KEY,
        control_id INTEGER NOT NULL,
        framework_type VARCHAR(50) NOT NULL,
        project_id INTEGER,
        evidence_quality_score INTEGER,
        evidence_count_score INTEGER,
        evidence_recency_score INTEGER,
        task_completion_score INTEGER,
        risk_mitigation_score INTEGER,
        overall_score INTEGER NOT NULL,
        readiness_level VARCHAR(20) NOT NULL,
        recommendations JSONB,
        calculated_at TIMESTAMPTZ DEFAULT NOW(),
        organization_id INTEGER NOT NULL
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ctrl_readiness
        ON verifywise.control_readiness_scores(framework_type, project_id, organization_id);
    `);

    // 3. framework_readiness_scores
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.framework_readiness_scores (
        id SERIAL PRIMARY KEY,
        framework_type VARCHAR(50) NOT NULL,
        project_id INTEGER,
        total_controls INTEGER,
        avg_score INTEGER,
        ready_count INTEGER,
        needs_work_count INTEGER,
        at_risk_count INTEGER,
        not_started_count INTEGER,
        weakest_controls JSONB,
        calculated_at TIMESTAMPTZ DEFAULT NOW(),
        organization_id INTEGER NOT NULL
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_fw_readiness
        ON verifywise.framework_readiness_scores(framework_type, project_id, organization_id);
    `);

    // 4. ai_content_metadata
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.ai_content_metadata (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        field_name VARCHAR(100),
        badge_type VARCHAR(20) NOT NULL,
        model_used VARCHAR(100),
        model_provider VARCHAR(50),
        tool_name VARCHAR(100),
        confidence_score INTEGER,
        prompt_summary TEXT,
        human_reviewed BOOLEAN DEFAULT false,
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        review_action VARCHAR(20),
        created_by INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        organization_id INTEGER NOT NULL
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_content_entity
        ON verifywise.ai_content_metadata(entity_type, entity_id, organization_id);
      CREATE INDEX IF NOT EXISTS idx_ai_content_review
        ON verifywise.ai_content_metadata(human_reviewed, organization_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.ai_content_metadata CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.framework_readiness_scores CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.control_readiness_scores CASCADE",
    );
    await queryInterface.sequelize.query(
      "DROP TABLE IF EXISTS verifywise.evidence_ai_analysis CASCADE",
    );
  },
};
