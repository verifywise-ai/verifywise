"use strict";

/**
 * Records the most recent GitHub webhook delivery per registered repository,
 * so the repository settings can show whether GitHub is reaching VerifyWise
 * and whether the signature matched.
 *
 * ai_detection_repositories is already organization-scoped (organization_id),
 * so these columns inherit its tenant isolation.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_detection_repositories
        ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS last_webhook_status VARCHAR(30);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_detection_repositories
        DROP COLUMN IF EXISTS last_webhook_status,
        DROP COLUMN IF EXISTS last_webhook_at;
    `);
  },
};
