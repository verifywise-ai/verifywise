import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRaciMatrix, updateRaciUserRoles, type RaciMatrix } from "../repository/raci.repository";
import type { RaciRole } from "../../domain/enums/raci.enum";

export const raciQueryKey = (projectId: number) => ["raci", projectId] as const;

/** The use case's RACI matrix. */
export function useRaci(projectId: number) {
  return useQuery<RaciMatrix>({
    queryKey: raciQueryKey(projectId),
    queryFn: () => getRaciMatrix(projectId),
    enabled: projectId > 0,
  });
}

/** Save one person's roles; the response replaces the cached matrix. */
export function useUpdateRaciRoles(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roles }: { userId: number; roles: RaciRole[] }) =>
      updateRaciUserRoles(projectId, userId, roles),
    onSuccess: (matrix) => {
      queryClient.setQueryData(raciQueryKey(projectId), matrix);
    },
  });
}
