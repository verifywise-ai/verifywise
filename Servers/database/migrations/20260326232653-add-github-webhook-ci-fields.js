'use strict';

module.exports = {
  async up(queryInterface) {
    // Add CI/CD webhook fields to ai_detection_repositories
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_detection_repositories
        ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255),
        ADD COLUMN IF NOT EXISTS ci_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS ci_min_score INTEGER NOT NULL DEFAULT 70,
        ADD COLUMN IF NOT EXISTS ci_max_critical INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS ci_post_comments BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS ci_status_checks BOOLEAN NOT NULL DEFAULT TRUE;
    `);

    // Add webhook trigger fields to ai_detection_scans
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_detection_scans
        ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS pr_number INTEGER,
        ADD COLUMN IF NOT EXISTS commit_sha VARCHAR(40),
        ADD COLUMN IF NOT EXISTS branch VARCHAR(255);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_detection_scans
        DROP COLUMN IF EXISTS branch,
        DROP COLUMN IF EXISTS commit_sha,
        DROP COLUMN IF EXISTS pr_number,
        DROP COLUMN IF EXISTS trigger_type;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.ai_detection_repositories
        DROP COLUMN IF EXISTS ci_status_checks,
        DROP COLUMN IF EXISTS ci_post_comments,
        DROP COLUMN IF EXISTS ci_max_critical,
        DROP COLUMN IF EXISTS ci_min_score,
        DROP COLUMN IF EXISTS ci_enabled,
        DROP COLUMN IF EXISTS webhook_secret;
    `);
  }
};
