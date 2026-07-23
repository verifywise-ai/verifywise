import { useQuery } from "@tanstack/react-query";
import { getAllTasks } from "../repository/task.repository";
import type { ITask } from "../../domain/interfaces/i.task";

export const taskQueryKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskQueryKeys.all, "list"] as const,
  list: (filters: { includeArchived?: boolean }) => [...taskQueryKeys.lists(), filters] as const,
  details: () => [...taskQueryKeys.all, "detail"] as const,
  detail: (id: number | string) => [...taskQueryKeys.details(), id] as const,
};

interface UseTasksOptions {
  includeArchived?: boolean;
}

export function useTasks(options: UseTasksOptions = {}) {
  const { includeArchived } = options;

  return useQuery({
    queryKey: taskQueryKeys.list({ includeArchived }),
    queryFn: async ({ signal }) => {
      const response = await getAllTasks({
        include_archived: includeArchived || undefined,
        sort_by: "created_at",
        sort_order: "DESC",
        signal,
      });
      return (response?.data?.tasks as ITask[]) || [];
    },
    staleTime: 2 * 1000,
  });
}
