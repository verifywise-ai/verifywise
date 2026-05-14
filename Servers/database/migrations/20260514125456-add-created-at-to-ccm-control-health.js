"use strict";

/**
 * Migration: Add created_at column to ccm_control_health
 *
 * CcmControlHealthModel has timestamps: true but the original migration
 * only included updated_at. Sequelize's findOrCreate requires created_at.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.ccm_control_health
       ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE verifywise.ccm_control_health
       DROP COLUMN IF EXISTS created_at;`,
    );
  },
};
