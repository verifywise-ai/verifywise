"use strict";

/**
 * Add calculation_methodology column to governance_coverage_cache
 *
 * Stores a human-readable explanation of how the coverage percentage was
 * calculated so the UI can surface the methodology to users.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("governance_coverage_cache", "calculation_methodology", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("governance_coverage_cache", "calculation_methodology");
  },
};
