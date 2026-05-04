/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllEntities,
  getEntityById,
  createNewUser,
  updateEntityById,
  deleteEntityById,
  archiveIncidentById,
} from "../repository/entity.repository";
import { invalidateQueries } from "../config/queryClient";

// Base hook for fetching all entities
export const useGetAllEntities = (
  routeUrl: string,
  options?: {
    enabled?: boolean;
    staleTime?: number;
  },
) => {
  return useQuery({
    queryKey: ["entities", routeUrl],
    queryFn: () => getAllEntities({ routeUrl }),
    staleTime: options?.staleTime || 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
};

// Base hook for fetching entity by ID
export const useGetEntityById = (
  routeUrl: string,
  id: string | number,
  options?: {
    enabled?: boolean;
    staleTime?: number;
  },
) => {
  return useQuery({
    queryKey: ["entity", routeUrl, id],
    queryFn: () => getEntityById({ routeUrl: `${routeUrl}/${id}` }),
    staleTime: options?.staleTime || 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
};

// Base hook for creating entities
export const useCreateEntity = (routeUrl: string, invalidateKeys?: string[][]) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: any) => createNewUser({ routeUrl, body }),
    onSuccess: () => {
      // Invalidate related queries to refresh data
      if (invalidateKeys) {
        invalidateQueries(invalidateKeys);
      }
      // Also invalidate the general entities list
      queryClient.invalidateQueries({ queryKey: ["entities", routeUrl] });
    },
  });
};

// Base hook for updating entities
export const useUpdateEntity = (routeUrl: string, invalidateKeys?: string[][]) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string | number; body: any }) =>
      updateEntityById({ routeUrl: `${routeUrl}/${id}`, body }),
    onSuccess: (_, variables) => {
      // Invalidate related queries
      if (invalidateKeys) {
        invalidateQueries(invalidateKeys);
      }
      // Invalidate specific entity and list
      queryClient.invalidateQueries({ queryKey: ["entity", routeUrl, variables.id] });
      queryClient.invalidateQueries({ queryKey: ["entities", routeUrl] });
    },
  });
};

// Base hook for deleting entities
export const useDeleteEntity = (routeUrl: string, invalidateKeys?: string[][]) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | number) => deleteEntityById({ routeUrl: `${routeUrl}/${id}` }),
    onSuccess: (_, id) => {
      // Invalidate related queries
      if (invalidateKeys) {
        invalidateQueries(invalidateKeys);
      }
      // Remove from cache and invalidate list
      queryClient.removeQueries({ queryKey: ["entity", routeUrl, id] });
      queryClient.invalidateQueries({ queryKey: ["entities", routeUrl] });
    },
  });
};

// Base hook for archiving entities
export const useArchivedEntity = (routeUrl: string, invalidateKeys?: string[][]) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | number) =>
      archiveIncidentById({
        routeUrl: `${routeUrl}/${id}`,
        body: { archived: true },
      }),
    onSuccess: (_, id) => {
      // Invalidate related queries
      if (invalidateKeys) {
        invalidateQueries(invalidateKeys);
      }
      // Refresh cache
      queryClient.removeQueries({ queryKey: ["entity", routeUrl, id] });
      queryClient.invalidateQueries({ queryKey: ["entities", routeUrl] });
    },
  });
};
