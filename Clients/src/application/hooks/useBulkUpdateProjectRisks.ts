import { useMutation } from "@tanstack/react-query";
import {
  bulkUpdateProjectRisks,
  type BulkUpdateProjectRisksPayload,
} from "../repository/projectRisk.repository";

interface UseBulkUpdateProjectRisksOptions {
  onSuccess?: (payload: BulkUpdateProjectRisksPayload) => void;
  onError?: (error: unknown, payload: BulkUpdateProjectRisksPayload) => void;
}

export function useBulkUpdateProjectRisks(options: UseBulkUpdateProjectRisksOptions = {}) {
  return useMutation({
    mutationFn: (payload: BulkUpdateProjectRisksPayload) => bulkUpdateProjectRisks(payload),
    onSuccess: (_data, payload) => options.onSuccess?.(payload),
    onError: (error, payload) => options.onError?.(error, payload),
  });
}
