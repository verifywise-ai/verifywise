import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPolicy, updatePolicy } from "../repository/policy.repository";
import { PolicyInput } from "../../domain/interfaces/i.policy";
import { PolicyManagerModel } from "../../domain/models/Common/policy/policyManager.model";
import { policyQueryKeys } from "./usePolicies";
import { useOptimisticListMutation } from "./utils/optimisticMutation";

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
        ({ ...policy, ...input }) as PolicyManagerModel,
    invalidateKeys: ({ id }) => [[...policyQueryKeys.list()], [...policyQueryKeys.detail(id)]],
  });
}
