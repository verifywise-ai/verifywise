"use strict";

/**
 * MRM (Model Risk Management) — Branch 2 (monitoring / ingestion)
 *
 * The revalidation SEED flag on model_inventories.
 *
 * When an ingested metric breaches a threshold whose breach_action is
 * `notify_flag_revalidation`, VerifyWise flags the model for re-validation.
 * Branch 2 only SETS this seed flag (plus timestamp + reason) — the full
 * revalidation-task workflow (opening a validation, routing it, tracking it to
 * sign-off) is Branch 3. Keeping the flag on the model, additive and nullable,
 * means Branch 3 can promote it into a workflow without a schema change here.
 *
 * All columns are NULLABLE / defaulted — no backfill. Existing rows are simply
 * "not flagged" until a breach flags them.
 *
 * Tenant scoping is inherited from model_inventories.organization_id.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.model_inventories
          ADD COLUMN IF NOT EXISTS mrm_revalidation_flagged BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS mrm_revalidation_flagged_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS mrm_revalidation_reason TEXT;
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
          DROP COLUMN IF EXISTS mrm_revalidation_reason,
          DROP COLUMN IF EXISTS mrm_revalidation_flagged_at,
          DROP COLUMN IF EXISTS mrm_revalidation_flagged;
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
