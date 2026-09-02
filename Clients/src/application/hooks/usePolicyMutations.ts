import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPolicy, updatePolicy, deletePolicy } from "../repository/policy.repository";
import { PolicyInput } from "../../domain/interfaces/i.policy";
import { PolicyManagerModel } from "../../domain/models/Common/policy/policyManager.model";
import { policyQueryKeys } from "./usePolicies";
import { tagQueryKeys } from "./useTags";
import { useOptimisticListMutation } from "./utils/optimisticMutation";
import { showMutationErrorToast } from "./utils/mutationErrorToast";

export function useCreatePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PolicyInput) => createPolicy(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: policyQueryKeys.lists() });
    },
  });
}

export function useUpdatePolicy() {
  return useOptimisticListMutation<
    PolicyManagerModel,
    PolicyManagerModel,
    Error,
    { id: number; input: PolicyInput }
  >({
    mutationFn: ({ id, input }) => updatePolicy(id, input),
    queryKey: () => policyQueryKeys.list(),
    updateItem:
      ({ input }) =>
      (policy) =>
        ({
          ...policy,
          ...input,
        }) as PolicyManagerModel,
    invalidateKeys: ({ id }) => [[...policyQueryKeys.list()], [...policyQueryKeys.detail(id)]],
  });
}

/**
 * Deletes a policy, optimistically removing it from every cached policy list.
 * The removal is exact, so the list itself is not refetched on success — only
 * the policy-tags query is invalidated since deleting a policy can orphan a tag.
 */
export function useDeletePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deletePolicy(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: policyQueryKeys.all });
      const matches = queryClient.getQueriesData<PolicyManagerModel[]>({
        queryKey: policyQueryKeys.all,
      });
      const snapshots: [readonly unknown[], PolicyManagerModel[]][] = [];
      for (const [queryKey, data] of matches) {
        if (!Array.isArray(data)) continue;
        snapshots.push([queryKey, data]);
        queryClient.setQueryData<PolicyManagerModel[]>(
          queryKey,
          data.filter((policy) => policy.id !== id),
        );
      }
      return { snapshots };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagQueryKeys.all });
    },
    onError: (error, _id, context) => {
      if (context?.snapshots) {
        for (const [queryKey, data] of context.snapshots) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      showMutationErrorToast(error, "Failed to delete policy. Please try again.");
    },
  });
}
