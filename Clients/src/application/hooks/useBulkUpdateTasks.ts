import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bulkUpdateTasks, type BulkUpdateTasksPayload } from "../repository/task.repository";

interface UseBulkUpdateTasksOptions {
  onSuccess?: (payload: BulkUpdateTasksPayload) => void;
  onError?: (error: unknown, payload: BulkUpdateTasksPayload) => void;
  invalidateKeys?: readonly (readonly unknown[])[];
}

export function useBulkUpdateTasks(options: UseBulkUpdateTasksOptions = {}) {
  const queryClient = useQueryClient();
  const { invalidateKeys, onSuccess, onError } = options;

  return useMutation({
    mutationFn: (payload: BulkUpdateTasksPayload) => bulkUpdateTasks(payload),
    onSuccess: (_data, payload) => {
      invalidateKeys?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      onSuccess?.(payload);
    },
    onError: (error, payload) => onError?.(error, payload),
  });
}
