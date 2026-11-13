import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPermissionCatalog,
  getRolePermissions,
  replaceRolePermissions,
  type PermissionCatalogEntry,
  type RolePermissionRow,
} from "../repository/role.repository";

export const rolePermissionsKeys = {
  all: ["rolePermissions"] as const,
  catalog: () => [...rolePermissionsKeys.all, "catalog"] as const,
  forRole: (id: number | null) => [...rolePermissionsKeys.all, "role", id] as const,
};

export function usePermissionCatalog() {
  return useQuery<PermissionCatalogEntry[]>({
    queryKey: rolePermissionsKeys.catalog(),
    queryFn: ({ signal }) => getPermissionCatalog({ signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRolePermissions(roleId: number | null) {
  return useQuery<RolePermissionRow[]>({
    queryKey: rolePermissionsKeys.forRole(roleId),
    queryFn: ({ signal }) => getRolePermissions({ id: roleId!, signal }),
    enabled: roleId !== null,
  });
}

export function useReplaceRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: RolePermissionRow[] }) =>
      replaceRolePermissions({ id, permissions }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: rolePermissionsKeys.forRole(id) });
      qc.invalidateQueries({ queryKey: ["my-permissions"] });
    },
  });
}
