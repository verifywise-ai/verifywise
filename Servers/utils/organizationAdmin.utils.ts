import type { Request } from "express";
import { roleHasPermission } from "./rolePermissions.utils";

/**
 * Whether a role is an Admin of the organization (organization.admin): who
 * decides any risk's or model's approval. False for no role.
 */
export async function roleIsOrganizationAdmin(
  organizationId: number | null,
  role: string | null | undefined,
): Promise<boolean> {
  if (!role) return false;
  return roleHasPermission(organizationId, role, "organization.admin");
}

/** Whether the signed-in user of a request is an Admin of its organization. */
export const requestCallerIsAdmin = (req: Request): Promise<boolean> =>
  roleIsOrganizationAdmin(req.organizationId ?? null, req.role);
