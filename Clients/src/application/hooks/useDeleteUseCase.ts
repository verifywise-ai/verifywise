import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUseCase, type DeleteUseCaseResult } from "../repository/project.repository";
import { projectRiskQueryKeys } from "./useProjectRisks";

export interface DeleteUseCasePayload {
  id: number;
  archiveRisksLinkedOnlyHere: boolean;
}

/**
 * Deletes a use case in one request (DELETE /api/v1/projects/:id). The server
 * archives the risks linked only to it in the same transaction when asked, so
 * a failure changes nothing. Cached risk lists are refreshed when any risk was
 * archived.
 */
export function useDeleteUseCase() {
  const queryClient = useQueryClient();
  return useMutation<DeleteUseCaseResult, unknown, DeleteUseCasePayload>({
    mutationFn: (payload) => deleteUseCase(payload),
    onSuccess: (result) => {
      if (result?.archived_risk_ids?.length) {
        void queryClient.invalidateQueries({ queryKey: projectRiskQueryKeys.all });
      }
    },
  });
}
