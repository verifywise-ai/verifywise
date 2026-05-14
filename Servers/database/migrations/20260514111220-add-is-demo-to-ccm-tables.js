"use strict";

/**
 * Migration: Add is_demo column to CCM tables
 *
 * This allows the auto-driver to mark and selectively clean up CCM demo data.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tables = [
        "ccm_connectors",
        "ccm_control_tests",
        "ccm_test_results",
        "ccm_control_health",
        "ccm_alerts",
      ];

      for (const table of tables) {
        await queryInterface.sequelize.query(
          `ALTER TABLE verifywise.${table}
           ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;`,
          { transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tables = [
        "ccm_connectors",
        "ccm_control_tests",
        "ccm_test_results",
        "ccm_control_health",
        "ccm_alerts",
      ];

      for (const table of tables) {
        await queryInterface.sequelize.query(
          `ALTER TABLE verifywise.${table}
           DROP COLUMN IF EXISTS is_demo;`,
          { transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
