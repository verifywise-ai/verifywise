import { getRoleByName, getRoleNameById } from "./roleMap";
import { getRoleByIdQuery } from "./role.utils";
import {
  getEffectivePermissions,
  loadCustomRolePermissions,
  roleHasPermission,
} from "./rolePermissions.utils";
import { getUserByIdQuery } from "./user.utils";
import { CheckedInvitation, getPendingInvitationQuery } from "./invitation.utils";

/** Why a role may not be granted through an invitation. */
export type InviteRoleRefusal = "unknown_role" | "exceeds_access";

/**
 * Why `inviterRole` may not grant `roleId` through an invitation into
 * `organizationId`, or null if it may. Used by invite and resend.
 *
 * The role must exist, must not be SuperAdmin (granted through the
 * super_admins mapping, never an invite) and must be a built-in or this
 * organization's own role. Only the built-in Admin grants a built-in role:
 * built-ins carry powers checked by role name, outside the permission matrix.
 * Any other inviter grants only custom roles with no permission it lacks.
 *
 * A null inviterRole is a trusted caller (a super admin inviting into an
 * organization): the role is still checked, the inviter's ceiling is not.
 */
export async function inviteRoleRefusal(
  organizationId: number,
  inviterRole: string | null,
  roleId: number,
): Promise<InviteRoleRefusal | null> {
  // Read from the database, not the role-map cache: on another replica a
  // role created a moment ago would read as unknown, and a deleted one as
  // still grantable.
  const row = await getRoleByIdQuery(roleId);
  const role = row
    ? { id: row.id!, name: row.name, organizationId: row.organization_id ?? null }
    : null;
  if (
    !role ||
    role.name === "SuperAdmin" ||
    (role.organizationId !== null && role.organizationId !== organizationId)
  ) {
    return "unknown_role";
  }
  if (inviterRole === null) return null;

  const inviter = await getRoleByName(organizationId, inviterRole);
  if (inviter?.organizationId === null && inviter.name === "Admin") return null;
  if (role.organizationId === null) return "exceeds_access";

  const [granted, held] = await Promise.all([
    loadCustomRolePermissions(organizationId, role),
    getEffectivePermissions(organizationId, inviterRole),
  ]);
  for (const permission of granted) {
    if (!held.has(permission)) return "exceeds_access";
  }
  return null;
}

/**
 * Why `userId` may not send an invitation granting `roleId` into
 * `organizationId` from outside the invite route (the Advisor's
 * agent_send_invitation runs as the user who approved it). Applies the
 * route's rules: the user is a member of the organization whose role holds
 * invitation.super, and inviteRoleRefusal allows the role. "not_allowed"
 * covers everything before the role check.
 */
export async function userInviteRefusal(
  organizationId: number,
  userId: number,
  roleId: number,
): Promise<InviteRoleRefusal | "not_allowed" | null> {
  const user = userId ? await getUserByIdQuery(userId) : undefined;
  if (!user || user.organization_id !== organizationId) return "not_allowed";
  const roleName = await getRoleNameById(user.role_id);
  if (!roleName || !(await roleHasPermission(organizationId, roleName, "invitation.super"))) {
    return "not_allowed";
  }
  return inviteRoleRefusal(organizationId, roleName, roleId);
}

/**
 * The pending invitation an invite to `email` would replace, and whether the
 * inviter may replace it. Re-inviting rewrites that invitation and voids its
 * link, so it follows the revoke rule: `refusalFor` (the inviter's own check)
 * must allow its role. One whose role no longer exists stays replaceable.
 *
 * Pass `replace` on to createInvitationQuery, which then rewrites the
 * invitation only while it is unchanged since this check.
 */
export async function pendingInvitationToReplace(
  organizationId: number,
  email: string,
  roleId: number,
  refusalFor: (roleId: number) => Promise<string | null>,
): Promise<{ replace: CheckedInvitation | null; refused: boolean }> {
  const pending = await getPendingInvitationQuery(organizationId, email);
  if (!pending) return { replace: null, refused: false };
  const replace = {
    id: pending.id,
    roleId: pending.role_id,
    expiresAtMs: pending.expires_at_ms,
  };
  if (pending.role_id === roleId) return { replace, refused: false };
  const refusal = await refusalFor(pending.role_id);
  return { replace, refused: refusal !== null && refusal !== "unknown_role" };
}
