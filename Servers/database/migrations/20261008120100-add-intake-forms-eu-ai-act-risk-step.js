"use strict";

/** Per-form toggle for the required EU AI Act risk classification step. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_forms
        ADD COLUMN IF NOT EXISTS eu_ai_act_risk_step_enabled BOOLEAN NOT NULL DEFAULT false;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.intake_forms DROP COLUMN IF EXISTS eu_ai_act_risk_step_enabled;
    `);
  },
};
