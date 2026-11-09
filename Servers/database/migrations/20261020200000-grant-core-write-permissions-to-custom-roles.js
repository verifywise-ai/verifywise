"use strict";

/**
 * Core governance writes (use cases, vendors, models, policies, risks, task
 * creation, training) used to need only a login, so every custom organization
 * role could make them. They now require a permission key, and a custom role
 * with no row for a key is denied.
 *
 * Keep existing custom roles working: a role that already holds any editor
 * permission (`*.edit` allowed) gets the editor keys that now gate those
 * routes, and a role that holds any admin permission (`*.admin` allowed) also
 * gets training.admin. Roles with only read or contributor keys stay
 * read-only, which is what the new rule intends.
 *
 * down() removes nothing: rows granted here cannot be told apart from rows an
 * Admin granted later.
 */

const EDITOR_KEYS = [
  "useCase.edit",
  "vendor.edit",
  "model.edit",
  "training.edit",
  "policy.edit",
  "risks.edit",
  "task.edit",
];
const ADMIN_KEYS = ["training.admin"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const grant = (keys, suffix) =>
        queryInterface.sequelize.query(
          `
          INSERT INTO verifywise.role_permissions (organization_id, role_id, permission_key, allowed)
          SELECT DISTINCT rp.organization_id, rp.role_id, k.key, TRUE
            FROM verifywise.role_permissions rp
            JOIN verifywise.roles r ON r.id = rp.role_id AND r.organization_id = rp.organization_id
           CROSS JOIN unnest(ARRAY[:keys]::varchar[]) AS k(key)
           WHERE rp.allowed AND rp.permission_key LIKE :pattern
          ON CONFLICT (organization_id, role_id, permission_key) DO NOTHING;
        `,
          { replacements: { keys, pattern: `%${suffix}` }, transaction },
        );
      await grant(EDITOR_KEYS, ".edit");
      await grant(ADMIN_KEYS, ".admin");
    });
  },

  async down() {},
};
