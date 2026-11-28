"use strict";

/**
 * Adds `adoption_level` (SDAIA adoption level 0-5, NULL = not assessed) to the
 * level 2 impl table of every registry framework with `adoption_levels: true`
 * (today only Saudi NAII: saudi_naii_domains).
 *
 * IF NOT EXISTS: a fresh database gets the impl table from the 20260805*
 * registry migrations, an existing one from 20261126211629; both end with
 * the column after this runs.
 */

const { FRAMEWORK_STRUCTURES } = require("../../dist/structures");

const withLevels = () => FRAMEWORK_STRUCTURES.filter((fw) => fw.adoption_levels);
const constraintName = (table) => `${table}_adoption_level_check`;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      for (const fw of withLevels()) {
        const table = fw.tables.l2_impl;
        await sequelize.query(
          `ALTER TABLE verifywise.${table}
             ADD COLUMN IF NOT EXISTS adoption_level SMALLINT NULL;`,
          { transaction },
        );
        await sequelize.query(
          `ALTER TABLE verifywise.${table}
             DROP CONSTRAINT IF EXISTS ${constraintName(table)};`,
          { transaction },
        );
        await sequelize.query(
          `ALTER TABLE verifywise.${table}
             ADD CONSTRAINT ${constraintName(table)}
             CHECK (adoption_level IS NULL OR adoption_level BETWEEN 0 AND 5);`,
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
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      for (const fw of withLevels()) {
        await sequelize.query(
          `ALTER TABLE verifywise.${fw.tables.l2_impl} DROP COLUMN IF EXISTS adoption_level;`,
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
