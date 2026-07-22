"use strict";

/**
 * MRM (Model Risk Management) — Branch 1
 *
 * Additive, nullable columns on model_inventories for manual tiering and a
 * stable customer-set external key (used later by Branch-2 ingestion).
 *
 * All columns are NULLABLE — no backfill. Existing rows are simply "untiered"
 * until a human assigns a tier.
 *
 * Tiering is MANUAL in v1: these columns only STORE a human-chosen tier
 * (1/2/3). There is no scoring formula.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Tier enum: '1' | '2' | '3'. NULL on the column means "untiered".
      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_tier AS ENUM ('1', '2', '3');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.model_inventories
          ADD COLUMN IF NOT EXISTS external_key VARCHAR(255),
          ADD COLUMN IF NOT EXISTS mrm_tier verifywise.enum_mrm_tier,
          ADD COLUMN IF NOT EXISTS mrm_materiality_drivers TEXT,
          ADD COLUMN IF NOT EXISTS mrm_tiered_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS mrm_tiered_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL;
      `,
        { transaction },
      );

      // external_key is unique per org (partial: excludes the many NULL rows).
      // The Branch-2 ingestion path looks a model up by (org, external_key).
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_model_inventories_ext_key
          ON verifywise.model_inventories(organization_id, external_key)
          WHERE external_key IS NOT NULL;
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
        "DROP INDEX IF EXISTS verifywise.idx_model_inventories_ext_key;",
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.model_inventories
          DROP COLUMN IF EXISTS mrm_tiered_by,
          DROP COLUMN IF EXISTS mrm_tiered_at,
          DROP COLUMN IF EXISTS mrm_materiality_drivers,
          DROP COLUMN IF EXISTS mrm_tier,
          DROP COLUMN IF EXISTS external_key;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query("DROP TYPE IF EXISTS verifywise.enum_mrm_tier;", {
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
