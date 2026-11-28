"use strict";

/**
 * Adds `adoption_level` (SDAIA adoption level 0-5, NULL = not assessed) to
 * saudi_naii_domains, the level 2 impl table of Saudi NAII, the only registry
 * framework with `adoption_levels: true`. The table is named here rather than
 * read from the registry: a framework that sets the flag later needs its own
 * migration for its table.
 *
 * IF NOT EXISTS: a fresh database gets the impl table from the 20260805*
 * registry migrations, an existing one from 20261126211629; both end with
 * the column after this runs.
 */

const TABLES = ["saudi_naii_domains"];
const constraintName = (table) => `${table}_adoption_level_check`;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    try {
      for (const table of TABLES) {
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
      for (const table of TABLES) {
        await sequelize.query(
          `ALTER TABLE verifywise.${table} DROP COLUMN IF EXISTS adoption_level;`,
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
