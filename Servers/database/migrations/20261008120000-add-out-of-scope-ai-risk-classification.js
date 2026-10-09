"use strict";

/**
 * Adds 'Out of scope' to verifywise.enum_projects_ai_risk_classification for
 * systems outside the EU AI Act (Article 2(6)/(8), research and development
 * only). Its own migration: PostgreSQL cannot use a new enum value in the
 * transaction that adds it.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE verifywise.enum_projects_ai_risk_classification ADD VALUE IF NOT EXISTS 'Out of scope';`,
    );
  },

  async down() {
    // An enum value cannot be dropped without recreating the type and every
    // column that uses it. Rows using it would block that anyway. No-op.
  },
};
