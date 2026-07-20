import { updateProjectRisk } from "../repository/projectRisk.repository";
import { projectRiskQueryKeys, type ProjectRisk } from "./useProjectRisks";
import { useOptimisticListMutation } from "./utils/optimisticMutation";

export interface UpdateProjectRiskVariables {
  id: number;
  projectId?: number;
  body: Record<string, unknown>;
}

export interface UpdateProjectRiskResponse {
  status: number;
  data: {
    data?: { id?: number };
    message?: string;
    errors?: Array<{ message?: string }>;
  };
}

export function useUpdateProjectRisk() {
  return useOptimisticListMutation<
    ProjectRisk,
    UpdateProjectRiskResponse,
    Error,
    UpdateProjectRiskVariables
  >({
    mutationFn: ({ id, body }) =>
      updateProjectRisk({ id, body }) as Promise<UpdateProjectRiskResponse>,
    queryKey: ({ projectId }) => projectRiskQueryKeys.list(projectId ?? 0, "active"),
    updateItem:
      ({ id, body }) =>
      (risk) =>
        risk.id === id ? { ...risk, ...body } : risk,
  });
}
