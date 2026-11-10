import { apiServices } from "../../infrastructure/api/networkServices";
import { RoleModel } from "../../domain/models/Common/role/role.model";

export async function getAllRoles({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<any> {
  const response = await apiServices.get("/roles", {
    signal,
  });
  return response.data;
}

export async function getRoleById({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<any> {
  const response = await apiServices.get(`/roles/${id}`, {
    signal,
  });
  return response.data;
}

export async function createRole({ body }: { body: Partial<RoleModel> }): Promise<any> {
  const response = await apiServices.post("/roles", body);
  return response;
}

export async function updateRole({
  id,
  body,
}: {
  id: number;
  body: Partial<RoleModel>;
}): Promise<any> {
  const response = await apiServices.put(`/roles/${id}`, body);
  return response;
}

export async function deleteRole({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`/roles/${id}`);
  return response;
}

export interface PermissionCatalogEntry {
  key: string;
  module: string;
  description: string;
}

/** The full permission catalog (#4588) for the roles admin matrix. */
export async function getPermissionCatalog({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<PermissionCatalogEntry[]> {
  const response = await apiServices.get<{ data: PermissionCatalogEntry[] }>(
    "/roles/permissions/catalog",
    { signal },
  );
  const catalog = response.data?.data;
  return Array.isArray(catalog) ? catalog : [];
}

export interface RolePermissionRow {
  permission_key: string;
  allowed: boolean;
}

/** One role's granted custom permissions. */
export async function getRolePermissions({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}): Promise<RolePermissionRow[]> {
  const response = await apiServices.get<{ data: RolePermissionRow[] }>(
    `/roles/${id}/permissions`,
    { signal },
  );
  const rows = response.data?.data;
  return Array.isArray(rows) ? rows : [];
}

/** Replace a custom role's permission set (grant/revoke matrix save). */
export async function replaceRolePermissions({
  id,
  permissions,
}: {
  id: number;
  permissions: RolePermissionRow[];
}): Promise<any> {
  const response = await apiServices.put(`/roles/${id}/permissions`, { permissions });
  return response;
}

/**
 * The current user's effective permission keys (e.g. "agentDiscovery.admin"):
 * their role's built-in grants, or a custom role's granted permissions.
 */
export async function getMyPermissions({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<string[]> {
  const response = await apiServices.get<{ data: string[] }>("/roles/my-permissions", {
    signal,
  });
  const permissions = response.data?.data;
  return Array.isArray(permissions) ? permissions : [];
}
