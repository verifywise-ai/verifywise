import { useMutation } from "@tanstack/react-query";
import { bulkUpdateTasks, type BulkUpdateTasksPayload } from "../repository/task.repository";

interface UseBulkUpdateTasksOptions {
  onSuccess?: (payload: BulkUpdateTasksPayload) => void;
  onError?: (error: unknown, payload: BulkUpdateTasksPayload) => void;
}

export function useBulkUpdateTasks(options: UseBulkUpdateTasksOptions = {}) {
  return useMutation({
    mutationFn: (payload: BulkUpdateTasksPayload) => bulkUpdateTasks(payload),
    onSuccess: (_data, payload) => options.onSuccess?.(payload),
    onError: (error, payload) => options.onError?.(error, payload),
  });
}
