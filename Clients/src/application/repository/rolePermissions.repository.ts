import { apiServices } from "../../infrastructure/api/networkServices";
import type { ApiSuccessEnvelope } from "../../infrastructure/api/api.types";

/** One entry of the permission catalog (key, module, description). */
export interface PermissionCatalogEntry {
  key: string;
  module: string;
  description: string;
}

/** A permission row of a custom role's matrix. */
export interface RolePermissionInput {
  permission_key: string;
  allowed: boolean;
}

/**
 * The full permission catalog that the admin UI renders when granting
 * permissions to a custom role (issue #4588).
 */
export async function getPermissionCatalog({ signal }: { signal?: AbortSignal } = {}): Promise<
  PermissionCatalogEntry[]
> {
  const response = await apiServices.get<ApiSuccessEnvelope<PermissionCatalogEntry[]>>(
    "/roles/permissions/catalog",
    { signal },
  );
  return response.data.data;
}

/**
 * The effective permission keys of one role (built-in or custom).
 */
export async function getRolePermissions({
  roleId,
  signal,
}: {
  roleId: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const response = await apiServices.get<ApiSuccessEnvelope<string[]>>(
    `/roles/${roleId}/permissions`,
    { signal },
  );
  return response.data.data;
}

/**
 * Replaces a custom role's whole permission matrix in one transaction.
 */
export async function replaceRolePermissions({
  roleId,
  permissions,
}: {
  roleId: number;
  permissions: RolePermissionInput[];
}): Promise<any> {
  const response = await apiServices.put(`/roles/${roleId}/permissions`, { permissions });
  return response;
}

/**
 * The authenticated user's effective permission keys — feeds the client's
 * permission context so UI gates can be reconciled with custom roles.
 */
export async function getMyPermissions({ signal }: { signal?: AbortSignal } = {}): Promise<
  string[]
> {
  const response = await apiServices.get<ApiSuccessEnvelope<string[]>>("/roles/my-permissions", {
    signal,
  });
  return response.data.data;
}
