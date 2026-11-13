import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createRole, deleteRole, updateRole } from "../repository/role.repository";
import { rolePermissionsKeys } from "./useRolePermissions";
import { MY_PERMISSIONS_QUERY_KEY } from "./useMyPermissions";

/** Same key `useRoles` reads. */
const ROLES_QUERY_KEY = ["roles"] as const;

export interface RoleInput {
  name: string;
  description: string;
}

export interface CreatedRole {
  id: number;
  name: string;
  description: string;
}

/**
 * Refetch everything a role write can change: the role list, the role
 * permission matrices, and the current user's own effective permissions
 * (they may hold the role being edited). Awaited, so a mutation resolves only
 * once the roles list includes (or no longer includes) the role.
 */
const invalidateRoleQueries = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY }),
    qc.invalidateQueries({ queryKey: rolePermissionsKeys.all }),
    qc.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY }),
  ]);

/** POST /roles. Resolves with the created role (server envelope unwrapped). */
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoleInput): Promise<CreatedRole> => {
      const response = await createRole({ body, suppressGlobalErrorToast: true });
      return response?.data?.data as CreatedRole;
    },
    onSuccess: () => invalidateRoleQueries(qc),
  });
}

/** PUT /roles/:id (name and description). */
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: RoleInput }) =>
      updateRole({ id, body, suppressGlobalErrorToast: true }),
    onSuccess: () => invalidateRoleQueries(qc),
  });
}

/** DELETE /roles/:id. The server answers 409 while users still hold the role. */
export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRole({ id, suppressGlobalErrorToast: true }),
    onSuccess: (_data, id) => {
      // Take the role out of the cached list straight away so the Roles tab
      // stops asking for its permissions (it would 404) before the refetch.
      qc.setQueryData<Array<{ id: number }>>(ROLES_QUERY_KEY, (old) =>
        old?.filter((role) => role.id !== id),
      );
      qc.removeQueries({ queryKey: rolePermissionsKeys.forRole(id) });
      return invalidateRoleQueries(qc);
    },
  });
}
