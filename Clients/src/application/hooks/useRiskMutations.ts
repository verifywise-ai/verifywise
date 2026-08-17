/**
 * @fileoverview Consolidated project-risk mutations with optimistic updates.
 *
 * Project-risk list queries are cached under
 * [...projectRiskQueryKeys.list(projectId, "active"), refreshKey], so all
 * optimistic updates use prefix matching on ["projectRisks"] to hit every
 * cached variant (including refreshKey suffixes). On success the server-returned
 * entity replaces the optimistic item (no list refetch); only the derived
 * ["dashboard"] query is invalidated.
 *
 * @module application/hooks/useRiskMutations
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createProjectRisk,
  updateProjectRisk,
  deleteProjectRisk,
} from "../repository/projectRisk.repository";
import { projectRiskQueryKeys, type ProjectRisk } from "./useProjectRisks";
import { showMutationErrorToast } from "./utils/mutationErrorToast";

// The project-risk repository returns the full axios response; the
// authoritative entity lives at response.data.data (see UpdateProjectRiskResponse).
function extractRiskEntity(response: any): ProjectRisk | undefined {
  const entity = response?.data?.data ?? response?.data;
  return entity && typeof entity === "object" && "id" in entity
    ? (entity as ProjectRisk)
    : undefined;
}

type ListSnapshot = [readonly unknown[], ProjectRisk[]][];

/**
 * Snapshots every cached ["projectRisks"] list variant and applies `updater`.
 * Covers the refreshKey-suffixed variants via prefix matching.
 */
function patchRiskLists(
  queryClient: QueryClient,
  updater: (list: ProjectRisk[]) => ProjectRisk[],
): ListSnapshot {
  const matches = queryClient.getQueriesData<ProjectRisk[]>({ queryKey: projectRiskQueryKeys.all });
  const snapshots: ListSnapshot = [];
  for (const [queryKey, data] of matches) {
    if (!Array.isArray(data)) continue;
    snapshots.push([queryKey, data]);
    queryClient.setQueryData<ProjectRisk[]>(queryKey, updater(data));
  }
  return snapshots;
}

function restoreRiskLists(queryClient: QueryClient, snapshots: ListSnapshot | undefined): void {
  if (!snapshots) return;
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

const DASHBOARD_KEY: readonly unknown[] = ["dashboard"];

export interface CreateProjectRiskVariables {
  body: Record<string, unknown>;
}

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

export interface DeleteProjectRiskVariables {
  id: number;
}

export function useCreateProjectRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body }: CreateProjectRiskVariables) =>
      createProjectRisk({ body }) as Promise<UpdateProjectRiskResponse>,
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey: projectRiskQueryKeys.all });
      // Placeholder id until the server assigns the real one.
      const tempId = -Date.now();
      const optimisticRisk = { ...body, id: tempId } as unknown as ProjectRisk;
      const snapshots = patchRiskLists(queryClient, (list) => [optimisticRisk, ...list]);
      return { snapshots, tempId };
    },
    onSuccess: (response, _variables, context) => {
      const entity = extractRiskEntity(response);
      if (entity) {
        patchRiskLists(queryClient, (list) =>
          list.map((risk) => (risk.id === context?.tempId ? { ...risk, ...entity } : risk)),
        );
      }
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
    onError: (error, _variables, context) => {
      restoreRiskLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to create the risk. Please try again.");
    },
  });
}

export function useUpdateProjectRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: UpdateProjectRiskVariables) =>
      updateProjectRisk({ id, body }) as Promise<UpdateProjectRiskResponse>,
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: projectRiskQueryKeys.all });
      const snapshots = patchRiskLists(queryClient, (list) =>
        list.map((risk) => (risk.id === id ? ({ ...risk, ...body } as ProjectRisk) : risk)),
      );
      return { snapshots, id };
    },
    onSuccess: (response, _variables, context) => {
      const entity = extractRiskEntity(response);
      if (entity) {
        // The server entity carries the authoritative risk_level_autocalculated
        // and other computed display fields.
        patchRiskLists(queryClient, (list) =>
          list.map((risk) => (risk.id === context?.id ? { ...risk, ...entity } : risk)),
        );
      }
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
    onError: (error, _variables, context) => {
      restoreRiskLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to update the risk. Please try again.");
    },
  });
}

export function useDeleteProjectRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: DeleteProjectRiskVariables) => deleteProjectRisk({ id }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: projectRiskQueryKeys.all });
      const snapshots = patchRiskLists(queryClient, (list) =>
        list.filter((risk) => risk.id !== id),
      );
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
    },
    onError: (error, _variables, context) => {
      restoreRiskLists(queryClient, context?.snapshots);
      showMutationErrorToast(error, "Failed to delete the risk. Please try again.");
    },
  });
}
