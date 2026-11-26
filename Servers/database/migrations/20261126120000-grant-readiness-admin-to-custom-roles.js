"use strict";

/**
 * DELETE /api/v1/readiness/scores/:id lets the person who ran a readiness
 * calculation delete it; deleting someone else's public calculation needs the
 * new readiness.admin key. A custom role with no row for a key is denied, so
 * give the key to custom roles that hold organization.admin, as built-in
 * Admins hold it (Servers/config/rolePermissions.config.ts).
 *
 * Idempotent (ON CONFLICT DO NOTHING). down() removes nothing: rows granted
 * here cannot be told apart from rows an Admin granted later.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      INSERT INTO verifywise.role_permissions (organization_id, role_id, permission_key, allowed)
      SELECT DISTINCT rp.organization_id, rp.role_id, 'readiness.admin', TRUE
        FROM verifywise.role_permissions rp
        JOIN verifywise.roles r ON r.id = rp.role_id AND r.organization_id = rp.organization_id
       WHERE rp.allowed AND rp.permission_key = 'organization.admin'
      ON CONFLICT (organization_id, role_id, permission_key) DO NOTHING;
    `,
    );
  },

  async down() {},
};
