"use strict";

/**
 * Adds the missing `updated_at` column to the users table.
 *
 * The Sequelize model has `timestamps: true` and defines `updated_at`,
 * but the original DDL omitted this column. Any UPDATE operation
 * (e.g. role change) fails with:
 *   "column updated_at of relation users does not exist"
 *
 * Fixes: Issue #3395
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.users
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.users
        DROP COLUMN IF EXISTS updated_at;
    `);
  },
};
