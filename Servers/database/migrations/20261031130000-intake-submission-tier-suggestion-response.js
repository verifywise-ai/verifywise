"use strict";

/**
 * intake_submissions.tier_suggestion_response — what the applicant said about
 * the risk tier suggested to them before they submitted (#5190).
 *
 * { suggestedLevel, questionnaireVersion, accepted, context, respondedAt }.
 * suggestedLevel is the level the server scored from the submitted answers,
 * never a value the page sent. NULL when the form has no EU AI Act step, or
 * the submission came through a path that does not take a response.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_submissions
        ADD COLUMN IF NOT EXISTS tier_suggestion_response JSONB NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_submissions
        DROP COLUMN IF EXISTS tier_suggestion_response;
    `);
  },
};
