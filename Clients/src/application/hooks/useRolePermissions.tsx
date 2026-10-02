import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  getMyPermissions,
  getPermissionCatalog,
  getRolePermissions,
  replaceRolePermissions,
  type PermissionCatalogEntry,
  type RolePermissionInput,
} from "../repository/rolePermissions.repository";

const CATALOG_QUERY_KEY = ["roles", "permissions-catalog"] as const;
const MY_PERMISSIONS_QUERY_KEY = ["roles", "my-permissions"] as const;
const rolePermissionsKey = (roleId: number) => ["roles", roleId, "permissions"] as const;

/**
 * The full permission catalog (key, module, description) for the matrix UI.
 */
export function usePermissionCatalog() {
  return useQuery<PermissionCatalogEntry[]>({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => getPermissionCatalog({ signal }),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * One role's effective permission keys.
 */
export function useRolePermissions(roleId: number | null) {
  return useQuery<string[]>({
    queryKey: rolePermissionsKey(roleId ?? -1),
    queryFn: ({ signal }) => getRolePermissions({ roleId: roleId!, signal }),
    enabled: roleId != null,
    staleTime: 60 * 1000,
  });
}

/**
 * Replaces a custom role's whole permission matrix; refreshes the affected
 * queries (the role itself, everyone's "my permissions", the team role list).
 */
export function useReplaceRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: number; permissions: RolePermissionInput[] }) =>
      replaceRolePermissions({ roleId, permissions }),
    onSuccess: (_data, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: rolePermissionsKey(roleId) });
      queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}

/**
 * The authenticated user's effective permission keys (issue #4588).
 * Built-in roles resolve against the static matrix; custom roles against the
 * org's `role_permissions` rows. The backend stays the enforcing authority —
 * this only drives UI affordances.
 */
export function useMyPermissions() {
  const query = useQuery<string[]>({
    queryKey: MY_PERMISSIONS_QUERY_KEY,
    queryFn: ({ signal }) => getMyPermissions({ signal }),
    staleTime: 60 * 1000,
  });

  const permissions = useMemo(() => new Set(query.data ?? []), [query.data]);

  const can = useCallback(
    (permissionKey: string): boolean => permissions.has(permissionKey),
    [permissions],
  );

  return { ...query, permissions, can };
}
