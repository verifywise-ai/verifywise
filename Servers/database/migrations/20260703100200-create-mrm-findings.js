"use strict";

/**
 * MRM (Model Risk Management) — Branch 1
 *
 * mrm_findings: issues raised against a model, optionally tied to a specific
 * validation cycle. Tenant-scoped by organization_id.
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_finding_severity AS ENUM (
            'critical', 'high', 'medium', 'low'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_finding_stage AS ENUM (
            'open', 'remediation_planned', 'in_progress', 'resolved', 'closed'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_findings (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          -- RESTRICT: a model with findings cannot be hard-deleted (decommission instead).
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE RESTRICT,
          validation_id INTEGER REFERENCES verifywise.mrm_validations(id) ON DELETE SET NULL,
          title VARCHAR(255) NOT NULL,
          severity verifywise.enum_mrm_finding_severity NOT NULL DEFAULT 'medium',
          stage verifywise.enum_mrm_finding_stage NOT NULL DEFAULT 'open',
          owner_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          remediation_plan TEXT,
          due_date TIMESTAMP WITH TIME ZONE,
          closed_at TIMESTAMP WITH TIME ZONE,
          closed_verified BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_findings_org
          ON verifywise.mrm_findings(organization_id);
        CREATE INDEX IF NOT EXISTS idx_mrm_findings_model
          ON verifywise.mrm_findings(model_inventory_id);
        CREATE INDEX IF NOT EXISTS idx_mrm_findings_validation
          ON verifywise.mrm_findings(validation_id);
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
        "DROP TABLE IF EXISTS verifywise.mrm_findings CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_finding_stage;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP TYPE IF EXISTS verifywise.enum_mrm_finding_severity;",
        { transaction },
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
