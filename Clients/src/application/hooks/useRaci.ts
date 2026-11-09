import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRaciMatrix,
  updateRaciUserRoles,
  type RaciMatrix,
  type RaciRoleChange,
} from "../repository/raci.repository";

export const raciQueryKey = (projectId: number) => ["raci", projectId] as const;

/** The use case's RACI matrix. */
export function useRaci(projectId: number) {
  return useQuery<RaciMatrix>({
    queryKey: raciQueryKey(projectId),
    queryFn: () => getRaciMatrix(projectId),
    enabled: projectId > 0,
  });
}

/** Change one person's roles; the response replaces the cached matrix. */
export function useUpdateRaciRoles(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, change }: { userId: number; change: RaciRoleChange }) =>
      updateRaciUserRoles(projectId, userId, change),
    onSuccess: (matrix) => {
      queryClient.setQueryData(raciQueryKey(projectId), matrix);
    },
  });
}
