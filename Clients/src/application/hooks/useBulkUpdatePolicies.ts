import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  bulkUpdatePolicies,
  type BulkUpdatePoliciesPayload,
  type BulkPolicyAction,
} from "../repository/policy.repository";
import { PolicyManagerModel } from "../../domain/models/Common/policy/policyManager.model";
import { policyQueryKeys } from "./usePolicies";
import { patchListItemsByIds } from "./utils/optimisticMutation";

interface UseBulkUpdatePoliciesOptions {
  onSuccess?: (payload: BulkUpdatePoliciesPayload) => void;
  onError?: (error: unknown, payload: BulkUpdatePoliciesPayload) => void;
}

function getOptimisticPatch(
  action: BulkPolicyAction,
  payload: BulkUpdatePoliciesPayload,
): Partial<PolicyManagerModel> {
  switch (action) {
    case "archive":
      return { status: "Archived" };
    case "set_reviewer":
      return {
        assigned_reviewer_ids: payload.reviewerId ? [payload.reviewerId] : [],
      };
    case "set_tags":
      return { tags: payload.tags as PolicyManagerModel["tags"] };
    default:
      return {};
  }
}

export function useBulkUpdatePolicies(options: UseBulkUpdatePoliciesOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BulkUpdatePoliciesPayload) => bulkUpdatePolicies(payload),
    onMutate: async (payload) => {
      const queryKey = policyQueryKeys.list();
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<PolicyManagerModel[]>(queryKey);
      const patch = getOptimisticPatch(payload.action, payload);
      if (previousData) {
        queryClient.setQueryData<PolicyManagerModel[]>(queryKey, (old) =>
          patchListItemsByIds(old, payload.ids, patch),
        );
      }
      return { previousData, queryKey };
    },
    onError: (error, payload, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      options.onError?.(error, payload);
    },
    onSettled: (_data, _error, _payload, context) => {
      if (context?.queryKey) {
        queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    },
    onSuccess: (_data, payload) => options.onSuccess?.(payload),
  });
}
