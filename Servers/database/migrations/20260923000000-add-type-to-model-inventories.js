"use strict";

/**
 * Model inventory classification type.
 *
 * Additive, nullable enum column on model_inventories classifying a model as
 * Traditional ML, GenAI, RAG, or Agentic AI.
 *
 * Nullable / additive — no backfill. Existing rows simply have NULL
 * ("unclassified") until a human assigns a type.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_model_inventories_type AS ENUM ('Traditional ML', 'GenAI', 'RAG', 'Agentic AI');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.model_inventories
          ADD COLUMN IF NOT EXISTS type verifywise.enum_model_inventories_type;
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
          DROP COLUMN IF EXISTS type;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_model_inventories_type;",
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
