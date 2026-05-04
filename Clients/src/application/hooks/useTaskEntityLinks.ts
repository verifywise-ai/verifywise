import { useQuery, useMutation, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
  getTaskEntityLinks,
  addTaskEntityLink,
  removeTaskEntityLink,
  ITaskEntityLink,
  EntityType,
} from "../repository/taskEntityLink.repository";

// Query keys for task entity links
export const taskEntityLinkQueryKeys = {
  all: ["taskEntityLinks"] as const,
  byTask: (taskId: number) => [...taskEntityLinkQueryKeys.all, "byTask", taskId] as const,
};

/**
 * Hook to fetch entity links for a task
 */
export const useTaskEntityLinks = (
  taskId: number | undefined,
): UseQueryResult<ITaskEntityLink[], Error> => {
  return useQuery({
    queryKey: taskEntityLinkQueryKeys.byTask(taskId!),
    queryFn: async () => {
      if (!taskId) return [];
      return await getTaskEntityLinks(taskId);
    },
    enabled: !!taskId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Hook to add an entity link to a task
 */
export const useAddTaskEntityLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      entityId,
      entityType,
    }: {
      taskId: number;
      entityId: number;
      entityType: EntityType;
    }) => {
      return await addTaskEntityLink(taskId, entityId, entityType);
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({
        queryKey: taskEntityLinkQueryKeys.byTask(taskId),
      });
    },
  });
};

/**
 * Hook to remove an entity link from a task
 */
export const useRemoveTaskEntityLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, linkId }: { taskId: number; linkId: number }) => {
      await removeTaskEntityLink(taskId, linkId);
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({
        queryKey: taskEntityLinkQueryKeys.byTask(taskId),
      });
    },
  });
};

export type { ITaskEntityLink, EntityType };
