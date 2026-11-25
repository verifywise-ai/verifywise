"use strict";

/**
 * Vendor research: `vendor_research_settings.auto_research_on_create`, whether a vendor that is
 * added to the organization is researched at once. TRUE is the default, so every organization keeps
 * what it had before (an automatic run when the deployment's VENDOR_RESEARCH_AUTO_RUN allows it),
 * including the organizations that have no settings row yet, which the application reads as on.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.vendor_research_settings
         ADD COLUMN IF NOT EXISTS auto_research_on_create BOOLEAN NOT NULL DEFAULT TRUE;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE verifywise.vendor_research_settings DROP COLUMN IF EXISTS auto_research_on_create;",
    );
  },
};
