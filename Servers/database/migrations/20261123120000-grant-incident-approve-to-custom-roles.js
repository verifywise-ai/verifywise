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
 * A custom role with no row for a key is denied. Grant incident.approve the
 * way the built-in roles hold it:
 *   - roles holding organization.admin (Admin-like);
 *   - Reviewer-like roles: they hold a contributor-tier key (file.contribute,
 *     fileManager.contribute or riskLinks.review) but may not report
 *     incidents (no incident.create). 20261122180000 gives them no
 *     incident.edit, so they approve but do not edit, like built-in Reviewers.
 * Editor-like roles (incident.create) keep incident.edit and get no approval,
 * like built-in Editors. Built-in roles get their keys from code
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
       WHERE rp.allowed
         AND (
           rp.permission_key = 'organization.admin'
           OR (
             rp.permission_key IN ('file.contribute', 'fileManager.contribute', 'riskLinks.review')
             AND NOT EXISTS (
               SELECT 1 FROM verifywise.role_permissions c
                WHERE c.organization_id = rp.organization_id
                  AND c.role_id = rp.role_id
                  AND c.permission_key = 'incident.create'
                  AND c.allowed
             )
           )
         )
      ON CONFLICT (organization_id, role_id, permission_key) DO NOTHING;
    `,
    );
  },

  async down() {},
};
