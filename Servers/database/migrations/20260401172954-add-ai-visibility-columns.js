"use strict";

/**
 * Add visibility control (public/private) to all Phase 0 AI tables.
 * Also adds created_by where missing for per-user private results.
 * Existing rows default to 'public' — backward compatible.
 */
module.exports = {
  async up(queryInterface) {
    // 1. Add columns
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.evidence_ai_analysis
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.control_readiness_scores
        ADD COLUMN IF NOT EXISTS created_by INTEGER,
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        ADD COLUMN IF NOT EXISTS created_by INTEGER,
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.readiness_history
        ADD COLUMN IF NOT EXISTS created_by INTEGER,
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_content_metadata
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public'
    `);

    // 2. Update unique indexes to allow per-user private results
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS uq_ctrl_readiness_control_fw_proj_org
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrl_readiness_full
        ON verifywise.control_readiness_scores(control_id, framework_type, COALESCE(project_id, 0), COALESCE(created_by, 0), organization_id)
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS uq_fw_readiness_fw_proj_org
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fw_readiness_full
        ON verifywise.framework_readiness_scores(framework_type, COALESCE(project_id, 0), COALESCE(created_by, 0), organization_id)
    `);

    // 3. Visibility filter indexes
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_evidence_ai_vis
        ON verifywise.evidence_ai_analysis(visibility, organization_id)
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ctrl_readiness_vis
        ON verifywise.control_readiness_scores(visibility, created_by, organization_id)
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_content_vis
        ON verifywise.ai_content_metadata(visibility, created_by, organization_id)
    `);
  },

  async down(queryInterface) {
    // Drop visibility indexes
    await queryInterface.sequelize.query("DROP INDEX IF EXISTS idx_ai_content_vis");
    await queryInterface.sequelize.query("DROP INDEX IF EXISTS idx_ctrl_readiness_vis");
    await queryInterface.sequelize.query("DROP INDEX IF EXISTS idx_evidence_ai_vis");

    // Restore original unique indexes
    await queryInterface.sequelize.query("DROP INDEX IF EXISTS uq_fw_readiness_full");
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fw_readiness_fw_proj_org
        ON verifywise.framework_readiness_scores(framework_type, COALESCE(project_id, 0), organization_id)
    `);

    await queryInterface.sequelize.query("DROP INDEX IF EXISTS uq_ctrl_readiness_full");
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrl_readiness_control_fw_proj_org
        ON verifywise.control_readiness_scores(control_id, framework_type, COALESCE(project_id, 0), organization_id)
    `);

    // Remove columns
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.ai_content_metadata DROP COLUMN IF EXISTS visibility",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.readiness_history DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS created_by",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.framework_readiness_scores DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS created_by",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.control_readiness_scores DROP COLUMN IF EXISTS visibility, DROP COLUMN IF EXISTS created_by",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.evidence_ai_analysis DROP COLUMN IF EXISTS visibility",
    );
  },
};
