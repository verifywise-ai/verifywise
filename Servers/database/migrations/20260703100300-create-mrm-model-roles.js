"use strict";

/**
 * MRM (Model Risk Management) — Branch 1
 *
 * mrm_model_roles: per-model role assignments (owner/developer/validator/
 * approver). This is a NEW join table — the org-level RBAC roles table is NOT
 * reused for per-model MRM roles. Tenant-scoped by organization_id.
 *
 * A user can hold at most one instance of a given role on a given model
 * (enforced by the UNIQUE constraint).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        DO $$ BEGIN
          CREATE TYPE verifywise.enum_mrm_model_role AS ENUM (
            'owner', 'developer', 'validator', 'approver'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.mrm_model_roles (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          model_inventory_id INTEGER NOT NULL REFERENCES verifywise.model_inventories(id) ON DELETE CASCADE,
          role verifywise.enum_mrm_model_role NOT NULL,
          user_id INTEGER REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          UNIQUE (organization_id, model_inventory_id, role, user_id)
        );
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS idx_mrm_model_roles_org
          ON verifywise.mrm_model_roles(organization_id);
        CREATE INDEX IF NOT EXISTS idx_mrm_model_roles_model
          ON verifywise.mrm_model_roles(model_inventory_id);
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
        "DROP TABLE IF EXISTS verifywise.mrm_model_roles CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query("DROP TYPE IF EXISTS verifywise.enum_mrm_model_role;", {
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
