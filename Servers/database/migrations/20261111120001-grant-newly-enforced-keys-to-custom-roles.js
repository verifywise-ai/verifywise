"use strict";

/**
 * Issue #5314: two write paths that needed only a login now require a
 * permission key, and a custom role with no row for a key is denied:
 *   - POST /ai-incident-managements          -> incident.create
 *   - post-market monitoring config/questions -> postMarketMonitoring.edit
 *
 * Keep existing custom roles working the way 20261020200000 did for the core
 * writes: a role that already holds any editor permission (`*.edit` allowed)
 * gets both keys. Roles with only read, contributor or admin keys stay as
 * they are. Built-in roles get these keys from code
 * (Servers/config/rolePermissions.config.ts), not from rows.
 *
 * Idempotent (ON CONFLICT DO NOTHING). down() removes nothing: rows granted
 * here cannot be told apart from rows an Admin granted later.
 */

const EDITOR_KEYS = ["incident.create", "postMarketMonitoring.edit"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        INSERT INTO verifywise.role_permissions (organization_id, role_id, permission_key, allowed)
        SELECT DISTINCT rp.organization_id, rp.role_id, k.key, TRUE
          FROM verifywise.role_permissions rp
          JOIN verifywise.roles r ON r.id = rp.role_id AND r.organization_id = rp.organization_id
         CROSS JOIN unnest(ARRAY[:keys]::varchar[]) AS k(key)
         WHERE rp.allowed AND rp.permission_key LIKE '%.edit'
        ON CONFLICT (organization_id, role_id, permission_key) DO NOTHING;
      `,
        { replacements: { keys: EDITOR_KEYS }, transaction },
      );
    });
  },

  async down() {},
};
