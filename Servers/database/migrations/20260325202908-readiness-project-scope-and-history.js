"use strict";

/**
 * Upgrade-safe migration: adds project-scoped unique indexes and readiness_history table.
 *
 * Fixes the earlier 20260325183928 migration which may have already run with
 * org-only unique indexes. This migration:
 *   1. Drops old indexes (IF EXISTS — safe if they never existed)
 *   2. Creates new project-aware indexes
 *   3. Creates readiness_history table (IF NOT EXISTS — safe for re-run)
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Drop old org-only unique indexes (from earlier migration, if they ran)
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.uq_ctrl_readiness_control_fw_org
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS verifywise.uq_fw_readiness_fw_org
    `);

    // 2. Create project-aware unique indexes
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrl_readiness_control_fw_proj_org
        ON verifywise.control_readiness_scores(control_id, framework_type, COALESCE(project_id, 0), organization_id)
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fw_readiness_fw_proj_org
        ON verifywise.framework_readiness_scores(framework_type, COALESCE(project_id, 0), organization_id)
    `);

    // 3. Create readiness_history table (INSERT-only, never overwritten)
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.readiness_history (
        id SERIAL PRIMARY KEY,
        framework_type VARCHAR(50) NOT NULL,
        project_id INTEGER,
        avg_score INTEGER NOT NULL,
        total_controls INTEGER,
        ready_count INTEGER,
        needs_work_count INTEGER,
        at_risk_count INTEGER,
        not_started_count INTEGER,
        calculated_at TIMESTAMPTZ DEFAULT NOW(),
        organization_id INTEGER NOT NULL
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_readiness_history_lookup
        ON verifywise.readiness_history(framework_type, organization_id, calculated_at DESC)
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.uq_ctrl_readiness_control_fw_proj_org`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.uq_fw_readiness_fw_proj_org`,
    );
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.readiness_history CASCADE`,
    );

    // Restore old org-only indexes
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrl_readiness_control_fw_org
        ON verifywise.control_readiness_scores(control_id, framework_type, organization_id)
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fw_readiness_fw_org
        ON verifywise.framework_readiness_scores(framework_type, organization_id)
    `);
  },
};
