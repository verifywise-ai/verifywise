"use strict";

/**
 * Migration: Add updated_at to ccm_alerts
 *
 * The ccm_alerts table was missing updated_at, but the Sequelize model
 * has timestamps: true, causing "column updated_at does not exist" errors.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE verifywise.ccm_alerts
         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();`,
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
        `ALTER TABLE verifywise.ccm_alerts
         DROP COLUMN IF EXISTS updated_at;`,
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
