"use strict";

/**
 * Adds a single `article` text column to the three EU AI Act struct tables.
 * `article` is a simple scalar pointer back to the AI Act article/paragraph
 * a requirement implements, so it can safely live as a column.
 *
 * `roles` and `risk_tiers` are modelled via junction tables in a separate
 * migration (see 20260417151000-add-eu-act-roles-risk-tiers-junctions.js).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.controlcategories_struct_eu
        ADD COLUMN IF NOT EXISTS article TEXT;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.controls_struct_eu
        ADD COLUMN IF NOT EXISTS article TEXT;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.subcontrols_struct_eu
        ADD COLUMN IF NOT EXISTS article TEXT;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.subcontrols_struct_eu
        DROP COLUMN IF EXISTS article;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.controls_struct_eu
        DROP COLUMN IF EXISTS article;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.controlcategories_struct_eu
        DROP COLUMN IF EXISTS article;
    `);
  },
};
