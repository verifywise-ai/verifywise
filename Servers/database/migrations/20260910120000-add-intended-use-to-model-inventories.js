"use strict";

/**
 * Adds an optional free-text `intended_use` column to model_inventories.
 *
 * Nullable / additive — no backfill. Existing rows simply have NULL.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.model_inventories
          ADD COLUMN IF NOT EXISTS intended_use TEXT;
      `,
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
        `
        ALTER TABLE verifywise.model_inventories
          DROP COLUMN IF EXISTS intended_use;
      `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
