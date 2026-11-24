import { useQuery } from "@tanstack/react-query";
import { getAllTasks } from "../repository/task.repository";
import type { EntityLinkType, ITask } from "../../domain/interfaces/i.task";

export const taskQueryKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskQueryKeys.all, "list"] as const,
  list: (filters: { includeArchived?: boolean }) => [...taskQueryKeys.lists(), filters] as const,
  linked: (entityType: EntityLinkType, entityId: number) =>
    [...taskQueryKeys.lists(), "linked", entityType, entityId] as const,
  details: () => [...taskQueryKeys.all, "detail"] as const,
  detail: (id: number | string) => [...taskQueryKeys.details(), id] as const,
};

interface UseTasksOptions {
  includeArchived?: boolean;
  /** Skip the global error toast; the caller shows its own message. */
  suppressGlobalErrorToast?: boolean;
}

export function useTasks(options: UseTasksOptions = {}) {
  const { includeArchived, suppressGlobalErrorToast } = options;

  return useQuery({
    queryKey: taskQueryKeys.list({ includeArchived }),
    queryFn: async ({ signal }) => {
      const response = await getAllTasks({
        include_archived: includeArchived || undefined,
        sort_by: "created_at",
        sort_order: "DESC",
        signal,
        suppressGlobalErrorToast,
      });
      return (response?.data?.tasks as ITask[]) || [];
    },
    staleTime: 2 * 1000,
  });
}

/**
 * The tasks linked to one entity (an incident, a vendor, ...) that the user
 * can see, archived tasks left out. Disabled without an entity id.
 */
export function useLinkedTasks(entityType: EntityLinkType, entityId: number | undefined) {
  return useQuery({
    queryKey: taskQueryKeys.linked(entityType, entityId ?? 0),
    queryFn: async ({ signal }) => {
      const response = await getAllTasks({
        linked_entity: { entity_type: entityType, entity_id: entityId as number },
        sort_by: "created_at",
        sort_order: "DESC",
        signal,
        suppressGlobalErrorToast: true,
      });
      return (response?.data?.tasks as ITask[]) || [];
    },
    enabled: typeof entityId === "number" && entityId > 0,
    staleTime: 2 * 1000,
  });
}
