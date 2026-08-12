"use strict";

/**
 * Readiness scoring now derives from requirement completion, assessment
 * completion and evidence quality.
 *
 * - control_readiness_scores.requirements_score: share of the control's
 *   requirement rows that are complete (0-100).
 * - framework_readiness_scores.controls_avg_score: the layer-1 average.
 * - framework_readiness_scores.assessment_score: assessment completion, or
 *   NULL when the framework has no assessment questions in scope.
 *
 * task_completion_score and risk_mitigation_score are intentionally NOT
 * dropped: the advisor's generateRecommendations still selects them. They are
 * simply no longer written.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.control_readiness_scores
        ADD COLUMN IF NOT EXISTS requirements_score INTEGER
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        ADD COLUMN IF NOT EXISTS controls_avg_score INTEGER
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        ADD COLUMN IF NOT EXISTS assessment_score INTEGER
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.control_readiness_scores
        DROP COLUMN IF EXISTS requirements_score
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        DROP COLUMN IF EXISTS controls_avg_score
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.framework_readiness_scores
        DROP COLUMN IF EXISTS assessment_score
    `);
  },
};
