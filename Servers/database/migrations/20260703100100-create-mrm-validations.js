"use strict";

/**
 * MRM (Model Risk Management) — Branch 1
 *
 * mrm_validations: one row per validation cycle for a model. Tenant-scoped by
 * organization_id. The report JSONB holds the 6 validation-report sections,
 * each { text, evidence_links: [] }:
 *   purpose_scope, conceptual_soundness, data_review, outcomes_analysis,
 *   findings_limitations, conclusion_signoff.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_validation_stage AS ENUM (
            'not_started', 'in_validation', 'under_review', 'validated'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_validation_trigger AS ENUM (
            'periodic', 'first_use', 'change', 'breach'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_validation_outcome AS ENUM (
            'validated', 'validated_with_findings', 'not_validated'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_validations (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          -- RESTRICT: a model with validation history cannot be hard-deleted (decommission instead).
          -- Org-level delete still cascades via organization_id above.
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE RESTRICT,
          stage verifywise.enum_mrm_validation_stage NOT NULL DEFAULT 'not_started',
          trigger verifywise.enum_mrm_validation_trigger,
          validator_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          outcome verifywise.enum_mrm_validation_outcome,
          report_version VARCHAR(50),
          report JSONB NOT NULL DEFAULT '{}'::jsonb,
          signed_off_at TIMESTAMP WITH TIME ZONE,
          signed_off_by INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          next_due TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_validations_org
          ON verifywise.mrm_validations(organization_id);
        CREATE INDEX IF NOT EXISTS idx_mrm_validations_model
          ON verifywise.mrm_validations(model_inventory_id);
        -- At most one in-flight validation per model (any stage other than 'validated').
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mrm_validations_one_active
          ON verifywise.mrm_validations(organization_id, model_inventory_id)
          WHERE stage <> 'validated';
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
        "DROP TABLE IF EXISTS verifywise.mrm_validations CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_validation_outcome;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_validation_trigger;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_validation_stage;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
