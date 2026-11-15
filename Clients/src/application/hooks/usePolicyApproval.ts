/**
 * React Query hooks for policy approval (api/v1/policies/:id/approval,
 * submit-for-approval, approve) and withdrawing the policy's request.
 */

import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approvePolicyDirectly,
  getPolicyApproval,
  submitPolicyForApproval,
} from "../repository/policy.repository";
import { withdrawRequest } from "../repository/approvalRequest.repository";
import { policyQueryKeys } from "./usePolicies";
import { onPolicyApprovalChanged, type PolicyApprovalChangedDetail } from "../events/policyEvents";

/** Sits under the policy's detail key, so invalidating the detail refreshes it too. */
export const policyApprovalQueryKey = (policyId: number) =>
  [...policyQueryKeys.detail(policyId), "approval"] as const;

export const usePolicyApproval = (policyId: number | undefined) =>
  useQuery({
    queryKey: policyApprovalQueryKey(policyId as number),
    queryFn: () => getPolicyApproval(policyId as number),
    enabled: policyId != null,
  });

/**
 * Invalidates everything an approval action changes: the policy and its
 * approval state, the policy lists and the history sidebar. With no id, every
 * policy and every policy history.
 */
export function useInvalidatePolicyApproval() {
  const queryClient = useQueryClient();
  return useCallback(
    (policyId?: number) => {
      if (policyId == null) {
        queryClient.invalidateQueries({ queryKey: policyQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: ["changeHistory", "policy"] });
        return;
      }
      queryClient.invalidateQueries({ queryKey: policyQueryKeys.detail(policyId) });
      queryClient.invalidateQueries({ queryKey: policyQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["changeHistory", "policy", policyId] });
    },
    [queryClient],
  );
}

export function useSubmitPolicyForApproval() {
  const invalidate = useInvalidatePolicyApproval();
  return useMutation({
    mutationFn: ({ policyId, workflowId }: { policyId: number; workflowId?: number }) =>
      submitPolicyForApproval(policyId, workflowId),
    onSettled: (_data, _error, { policyId }) => invalidate(policyId),
  });
}

export function useApprovePolicyDirectly() {
  const invalidate = useInvalidatePolicyApproval();
  return useMutation({
    mutationFn: ({ policyId, comment }: { policyId: number; comment?: string }) =>
      approvePolicyDirectly(policyId, comment),
    onSettled: (_data, _error, { policyId }) => invalidate(policyId),
  });
}

export function useWithdrawPolicyApproval() {
  const invalidate = useInvalidatePolicyApproval();
  return useMutation({
    mutationFn: ({ requestId }: { policyId: number; requestId: number }) =>
      withdrawRequest({ id: requestId, suppressGlobalErrorToast: true }),
    onSettled: (_data, _error, { policyId }) => invalidate(policyId),
  });
}

/**
 * Refreshes policy queries when the approval requests modal decides or
 * withdraws a policy request, and calls `onChange` (for state the page keeps
 * outside React Query, like the editor's loaded policy).
 */
export function usePolicyApprovalChangedListener(
  onChange?: (detail?: PolicyApprovalChangedDetail) => void,
) {
  const invalidate = useInvalidatePolicyApproval();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () =>
      onPolicyApprovalChanged((detail) => {
        invalidate(detail?.policyId);
        onChangeRef.current?.(detail);
      }),
    [invalidate],
  );
}
