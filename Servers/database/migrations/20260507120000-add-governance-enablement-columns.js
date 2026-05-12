"use strict";

/**
 * Migration: Add enablement columns to governance_org_preferences
 *
 * Adds:
 * - is_enabled: controls whether Governance OS is visible/active for the org
 * - dont_ask_governance_os: persists "don't ask again" for the enable prompt
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_org_preferences
         ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_org_preferences
         ADD COLUMN IF NOT EXISTS dont_ask_governance_os BOOLEAN NOT NULL DEFAULT FALSE;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_org_preferences
         DROP COLUMN IF EXISTS is_enabled;`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.governance_org_preferences
         DROP COLUMN IF EXISTS dont_ask_governance_os;`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
