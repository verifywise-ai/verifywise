import { useMutation } from "@tanstack/react-query";
import {
  bulkUpdateProjectRisks,
  type BulkUpdateProjectRisksPayload,
  type BulkUpdateProjectRisksResult,
} from "../repository/projectRisk.repository";

interface UseBulkUpdateProjectRisksOptions {
  onSuccess?: (
    payload: BulkUpdateProjectRisksPayload,
    result: BulkUpdateProjectRisksResult | undefined,
  ) => void;
  onError?: (error: unknown, payload: BulkUpdateProjectRisksPayload) => void;
}

export function useBulkUpdateProjectRisks(options: UseBulkUpdateProjectRisksOptions = {}) {
  return useMutation({
    mutationFn: (payload: BulkUpdateProjectRisksPayload) => bulkUpdateProjectRisks(payload),
    onSuccess: (response, payload) => options.onSuccess?.(payload, response?.data),
    onError: (error, payload) => options.onError?.(error, payload),
  });
}
