import { useQuery } from "@tanstack/react-query";
import { getApprovalWorkflowsByEntityType } from "../repository/approvalWorkflow.repository";
import { getUseCaseApprovalWorkflow } from "../repository/project.repository";

/** An active approval workflow that can review a use case, as a select item. */
export interface UseCaseWorkflowOption {
  _id: number;
  name: string;
  /** Risk level up to which the workflow approves a use case automatically. */
  autoApproveMaxRisk: string | null;
}

export const useCaseApprovalWorkflowsQueryKey = ["approvalWorkflows", "use_case"] as const;

/**
 * The organization's active use case approval workflows (the list only
 * returns active ones), shaped for a Select. Readable by every member.
 */
export function useUseCaseApprovalWorkflows() {
  return useQuery({
    queryKey: useCaseApprovalWorkflowsQueryKey,
    queryFn: async ({ signal }): Promise<UseCaseWorkflowOption[]> => {
      const workflows = await getApprovalWorkflowsByEntityType({ entityType: "use_case", signal });
      return workflows.map(
        (workflow: {
          id: number;
          workflow_title: string;
          auto_approve_max_risk?: string | null;
        }) => ({
          _id: Number(workflow.id),
          name: workflow.workflow_title,
          autoApproveMaxRisk: workflow.auto_approve_max_risk ?? null,
        }),
      );
    },
    staleTime: 60 * 1000,
  });
}

/** Keys of one use case's attached workflow; `all` refreshes every use case. */
export const useCaseApprovalWorkflowKeys = {
  all: ["useCaseApprovalWorkflow"] as const,
  detail: (projectId: number) => [...useCaseApprovalWorkflowKeys.all, projectId] as const,
};

/**
 * The approval workflow attached to one use case (title, archived or not) and
 * its approval status. Refreshed by a workflow change and by approval
 * decisions (RequestorApprovalModal).
 */
export function useUseCaseApprovalWorkflow(projectId: number) {
  return useQuery({
    queryKey: useCaseApprovalWorkflowKeys.detail(projectId),
    queryFn: ({ signal }) => getUseCaseApprovalWorkflow({ id: projectId, signal }),
    staleTime: 30 * 1000,
  });
}
