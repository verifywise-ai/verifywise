"use strict";

/**
 * Custom organization roles with configurable permissions (issue #4588).
 *
 * 1. Makes the global `roles` table organization-aware: built-in roles keep
 *    `organization_id IS NULL` (global, immutable); custom roles are scoped to
 *    one organization and are managed by that org's Admins.
 * 2. Adds `role_permissions`: the per-organization permission matrix that
 *    backs `authorize(<permission>)`. One row per (org, role, permission).
 *    Missing row = denied, so a custom role with no rows can log in but can
 *    do nothing until an Admin grants permissions.
 *
 * `authorize()` keeps working for built-ins without touching this table: they
 * resolve against the static BUILTIN_MATRIX (parity with the old role-name
 * allowlists, enforced by a unit test).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.roles
          ADD COLUMN IF NOT EXISTS organization_id INTEGER
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE;
      `,
        { transaction },
      );

      // Custom role names must be unique within their organization. Built-ins
      // (organization_id IS NULL) keep their global names untouched.
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX IF NOT EXISTS roles_org_name_unique
          ON verifywise.roles (organization_id, name)
          WHERE organization_id IS NOT NULL;
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.role_permissions (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          role_id INTEGER NOT NULL
            REFERENCES verifywise.roles(id) ON DELETE CASCADE,
          permission_key VARCHAR(100) NOT NULL,
          allowed BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          UNIQUE (organization_id, role_id, permission_key)
        );
      `,
        { transaction },
      );

      // Lookup pattern for authorize(): resolve a role in an org, then its rows.
      await queryInterface.sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS role_permissions_org_role_idx
          ON verifywise.role_permissions (organization_id, role_id);
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
        "DROP TABLE IF EXISTS verifywise.role_permissions CASCADE;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        "DROP INDEX IF EXISTS verifywise.roles_org_name_unique;",
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.roles
          DROP COLUMN IF EXISTS organization_id;
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
