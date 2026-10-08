"use strict";

/**
 * One row per completed EU AI Act classification questionnaire. A run belongs
 * to exactly one owner: an intake submission or a use case. Deleting the owner
 * deletes its runs. On approval the submission's run is copied to the new use
 * case rather than shared.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.eu_ai_act_classifications (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          use_case_id INTEGER REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          intake_submission_id INTEGER REFERENCES verifywise.intake_submissions(id) ON DELETE CASCADE,
          questionnaire_version INTEGER NOT NULL,
          role VARCHAR(20) CHECK (role IN ('Provider', 'Deployer')),
          answers JSONB NOT NULL,
          result JSONB NOT NULL,
          reviewer_level VARCHAR(50),
          reviewer_justification TEXT,
          reviewed_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          source VARCHAR(10) NOT NULL CHECK (source IN ('wizard', 'intake')),
          created_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT eu_ai_act_classifications_one_owner
            CHECK ((use_case_id IS NULL) <> (intake_submission_id IS NULL))
        );
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_eu_ai_act_classifications_use_case
           ON verifywise.eu_ai_act_classifications (organization_id, use_case_id);`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_eu_ai_act_classifications_submission
           ON verifywise.eu_ai_act_classifications (organization_id, intake_submission_id);`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS verifywise.eu_ai_act_classifications;`,
    );
  },
};
