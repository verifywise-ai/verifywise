import { useMutation } from "@tanstack/react-query";
import {
  bulkUpdatePolicies,
  type BulkUpdatePoliciesPayload,
} from "../repository/policy.repository";

interface UseBulkUpdatePoliciesOptions {
  onSuccess?: (payload: BulkUpdatePoliciesPayload) => void;
  onError?: (error: unknown, payload: BulkUpdatePoliciesPayload) => void;
}

export function useBulkUpdatePolicies(options: UseBulkUpdatePoliciesOptions = {}) {
  return useMutation({
    mutationFn: (payload: BulkUpdatePoliciesPayload) => bulkUpdatePolicies(payload),
    onSuccess: (_data, payload) => options.onSuccess?.(payload),
    onError: (error, payload) => options.onError?.(error, payload),
  });
}
