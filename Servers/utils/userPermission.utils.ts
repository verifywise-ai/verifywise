import { getUserByIdQuery } from "./user.utils";
import { getRoleById, type RoleInfo } from "./roleMap";
import { roleInfoHasPermission } from "./rolePermissions.utils";
import type { PermissionKey } from "../config/rolePermissions.config";

/**
 * The current role of user `userId` in `organizationId`, resolved from the
 * users row (not from a token) by role_id. Undefined when there is no user
 * id, the user is not a member of the organization (filtered in SQL), or the
 * role id is unknown. For code paths such as advisor tools that know the
 * caller's id but not their role.
 */
export async function getUserRoleInOrganization(
  organizationId: number,
  userId: number | undefined,
): Promise<RoleInfo | undefined> {
  if (!userId) return undefined;
  const user = await getUserByIdQuery(userId, null, organizationId);
  if (!user || user.role_id == null) return undefined;
  return getRoleById(user.role_id);
}

/**
 * True when user `userId` is a member of `organizationId` and their current
 * role holds `permissionKey`. Fails closed (see getUserRoleInOrganization).
 */
export async function userHasPermission(
  organizationId: number,
  userId: number | undefined,
  permissionKey: PermissionKey,
): Promise<boolean> {
  const role = await getUserRoleInOrganization(organizationId, userId);
  return role ? roleInfoHasPermission(organizationId, role, permissionKey) : false;
}
