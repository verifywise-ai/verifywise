"use strict";

/**
 * Drop the two readiness unique indexes that 20260401172954 meant to remove.
 *
 * That migration replaced the narrow keys with wider ones that add created_by —
 * uq_ctrl_readiness_full and uq_fw_readiness_full, the keys
 * upsertControlScoreQuery and upsertFrameworkScoreQuery target in ON CONFLICT.
 * Both of its DROP statements were written without the `verifywise.` prefix,
 * and with search_path unset during migration execution `DROP INDEX IF EXISTS`
 * matched nothing — the IF EXISTS turned each miss into a silent no-op. All
 * four indexes have existed ever since.
 *
 * The consequence is a readiness calculation that 500s with "Validation error"
 * (Sequelize's wrapper for a unique violation): a user recalculating a project
 * that a different user already scored does not conflict on the wide index, so
 * ON CONFLICT never fires, and the narrow index then rejects the INSERT.
 * Reproduced on 2026-07-29 after a user id changed — the control-level index
 * broke the per-control upsert, and the framework-level one broke the
 * aggregate write immediately after.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.uq_ctrl_readiness_control_fw_proj_org`,
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS verifywise.uq_fw_readiness_fw_proj_org`,
    );
  },

  async down(queryInterface) {
    // Recreating these can fail where rows now differ only by created_by —
    // exactly the state they forbid and the reason they are being dropped.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrl_readiness_control_fw_proj_org
        ON verifywise.control_readiness_scores(control_id, framework_type, project_id, organization_id)
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fw_readiness_fw_proj_org
        ON verifywise.framework_readiness_scores(framework_type, COALESCE(project_id, 0), organization_id)
    `);
  },
};
