"use strict";

/**
 * Revoke pending invitations that the fixed invite rules would refuse.
 *
 * Before the fix, POST /api/mail/invite only required a login and took the
 * organization and role from the request body, so any logged-in user could
 * invite anyone, as any role, into any organization. Such an invitation's
 * link still registers while its pending row exists. This deletes every
 * pending invitation the rules do not allow (deleting the pending row is what
 * revoking does, see revokeInvitationQuery). A pending invitation is kept
 * only if:
 *
 * - the role exists, is not SuperAdmin and is a built-in or this
 *   organization's own role (checked for every inviter, as the runtime does),
 *   and either
 *   - a super admin sent it (super-admin invites come from outside the org,
 *     so the inviter's own role sets no ceiling); or
 *   - the inviter is a member of the invitation's organization, and either
 *     - the inviter is the built-in Admin, or
 *     - the inviter's role is this organization's custom role holding
 *       invitation.super, the invited role is one of its custom roles, and
 *       the invited role has no permission the inviter's role lacks.
 *
 * Accepted invitations are left alone: they are history, not live links.
 * Pending ones with no recorded inviter are revoked: deleting a user clears
 * invited_by on their invitations, so a forged invite whose sender was later
 * removed looks exactly like a legacy row, and who sent it cannot be checked.
 * A legitimate pending invite this catches (for example from an Admin who has
 * since been demoted) can be sent again. Not reversible.
 */
module.exports = {
  async up(queryInterface) {
    const [revoked] = await queryInterface.sequelize.query(`
      DELETE FROM verifywise.invitations i
      WHERE i.status = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM verifywise.super_admins s
          JOIN verifywise.roles invited_role ON invited_role.id = i.role_id
          WHERE s.user_id = i.invited_by
            AND invited_role.name <> 'SuperAdmin'
            AND (
              invited_role.organization_id IS NULL
              OR invited_role.organization_id = i.organization_id
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM verifywise.users u
          JOIN verifywise.roles inviter_role ON inviter_role.id = u.role_id
          JOIN verifywise.roles invited_role ON invited_role.id = i.role_id
          WHERE u.id = i.invited_by
            AND u.organization_id = i.organization_id
            AND invited_role.name <> 'SuperAdmin'
            AND (
              invited_role.organization_id IS NULL
              OR invited_role.organization_id = i.organization_id
            )
            AND (
              (inviter_role.organization_id IS NULL AND inviter_role.name = 'Admin')
              OR (
                inviter_role.organization_id = i.organization_id
                AND invited_role.organization_id = i.organization_id
                AND EXISTS (
                  SELECT 1 FROM verifywise.role_permissions p
                  WHERE p.organization_id = i.organization_id
                    AND p.role_id = inviter_role.id
                    AND p.permission_key = 'invitation.super'
                    AND p.allowed
                )
                AND NOT EXISTS (
                  SELECT 1 FROM verifywise.role_permissions granted
                  WHERE granted.organization_id = i.organization_id
                    AND granted.role_id = invited_role.id
                    AND granted.allowed
                    AND NOT EXISTS (
                      SELECT 1 FROM verifywise.role_permissions held
                      WHERE held.organization_id = i.organization_id
                        AND held.role_id = inviter_role.id
                        AND held.permission_key = granted.permission_key
                        AND held.allowed
                    )
                )
              )
            )
        )
      RETURNING i.id, i.organization_id
    `);
    console.log(`Revoked ${revoked.length} pending invitation(s) the invite rules refuse.`);
  },

  async down() {
    // Revoked invitations cannot be restored; they can be sent again.
  },
};
