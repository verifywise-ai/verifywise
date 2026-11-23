"use strict";

/**
 * Editing, archiving and deleting an incident needed only a login, so every
 * member, Auditors included, could change or delete incidents. They now
 * require a permission key, and a custom role with no row for a key is denied:
 *   - PATCH /ai-incident-managements/:id and /:id/archive -> incident.edit
 *   - DELETE /ai-incident-managements/:id                 -> incident.delete
 *
 * Keep existing custom roles working the way 20261111120001 did:
 *   - a role that may report incidents (incident.create), holds a
 *     contributor-tier key (as built-in Reviewers do) or holds
 *     organization.admin may edit, approve and archive them;
 *   - a role that holds organization.admin may also delete them.
 * Other custom roles lose these writes until an Admin grants the keys.
 * Built-in roles get the keys from code (Servers/config/rolePermissions.config.ts).
 *
 * Idempotent (ON CONFLICT DO NOTHING). down() removes nothing: rows granted
 * here cannot be told apart from rows an Admin granted later.
 */

const GRANTS = [
  {
    key: "incident.edit",
    heldKeys: [
      "incident.create",
      "file.contribute",
      "fileManager.contribute",
      "riskLinks.review",
      "organization.admin",
    ],
  },
  { key: "incident.delete", heldKeys: ["organization.admin"] },
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const { key, heldKeys } of GRANTS) {
        await queryInterface.sequelize.query(
          `
          INSERT INTO verifywise.role_permissions (organization_id, role_id, permission_key, allowed)
          SELECT DISTINCT rp.organization_id, rp.role_id, :key, TRUE
            FROM verifywise.role_permissions rp
            JOIN verifywise.roles r ON r.id = rp.role_id AND r.organization_id = rp.organization_id
           WHERE rp.allowed AND rp.permission_key IN (:heldKeys)
          ON CONFLICT (organization_id, role_id, permission_key) DO NOTHING;
        `,
          { replacements: { key, heldKeys }, transaction },
        );
      }
    });
  },

  async down() {},
};
