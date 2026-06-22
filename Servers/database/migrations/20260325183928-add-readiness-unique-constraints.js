"use strict";

/**
 * Add initial unique constraints to readiness tables for upsert support.
 * NOTE: These org-only indexes are superseded by 20260325202908 which adds
 * project-scoped indexes. This migration is kept for sequelize history tracking.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrl_readiness_control_fw_org
        ON verifywise.control_readiness_scores(control_id, framework_type, organization_id)
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fw_readiness_fw_org
        ON verifywise.framework_readiness_scores(framework_type, organization_id)
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS uq_ctrl_readiness_control_fw_org
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS uq_fw_readiness_fw_org
    `);
  },
};
