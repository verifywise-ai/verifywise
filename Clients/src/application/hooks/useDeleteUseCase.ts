import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUseCase, type DeleteUseCaseResult } from "../repository/project.repository";
import { projectRiskQueryKeys } from "./useProjectRisks";
import { projectQueryKeys } from "./useProjects";

export interface DeleteUseCasePayload {
  id: number;
  archiveRisksLinkedOnlyHere: boolean;
}

/**
 * Deletes a use case in one request (DELETE /api/v1/projects/:id). The server
 * archives the risks linked only to it in the same transaction when asked, so
 * a failure changes nothing. Every successful delete refreshes the cached
 * project risk queries (the deleted use case's links are gone, and archived
 * risks leave the active lists) and the project lists.
 */
export function useDeleteUseCase() {
  const queryClient = useQueryClient();
  return useMutation<DeleteUseCaseResult, unknown, DeleteUseCasePayload>({
    mutationFn: (payload) => deleteUseCase(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectRiskQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });
    },
  });
}
