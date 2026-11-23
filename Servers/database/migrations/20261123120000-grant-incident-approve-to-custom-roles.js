"use strict";

/**
 * Approving an incident moved out of incident.edit into a new key,
 * incident.approve:
 *   - incident.edit    -> edit and archive incidents (built in: Admin, Editor)
 *   - incident.approve -> change approval_status and approval_notes
 *                         (built in: Admin, Reviewer)
 * PATCH /ai-incident-managements/:id accepts either key and checks which one
 * each changed field needs.
 *
 * A custom role with no row for a key is denied, so without this migration
 * every custom role holding incident.edit would lose approval. Grant
 * incident.approve to each of them, so no custom role loses what it can do
 * today. Built-in roles get their keys from code
 * (Servers/config/rolePermissions.config.ts).
 *
 * Idempotent (ON CONFLICT DO NOTHING). down() removes nothing: rows granted
 * here cannot be told apart from rows an Admin granted later.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      INSERT INTO verifywise.role_permissions (organization_id, role_id, permission_key, allowed)
      SELECT DISTINCT rp.organization_id, rp.role_id, 'incident.approve', TRUE
        FROM verifywise.role_permissions rp
        JOIN verifywise.roles r ON r.id = rp.role_id AND r.organization_id = rp.organization_id
       WHERE rp.allowed AND rp.permission_key = 'incident.edit'
      ON CONFLICT (organization_id, role_id, permission_key) DO NOTHING;
    `,
    );
  },

  async down() {},
};
