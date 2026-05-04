import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createShareLink,
  getShareLinksForResource,
  getShareLinkByToken,
  updateShareLink,
  deleteShareLink,
  CreateShareLinkParams,
  UpdateShareLinkParams,
} from "../repository/share.repository";

// Query keys for shares
export const shareQueryKeys = {
  all: ["shares"] as const,
  lists: () => [...shareQueryKeys.all, "list"] as const,
  list: (resourceType: string, resourceId: number) =>
    [...shareQueryKeys.lists(), resourceType, resourceId] as const,
  details: () => [...shareQueryKeys.all, "detail"] as const,
  detail: (token: string) => [...shareQueryKeys.details(), token] as const,
};

/**
 * Hook to fetch share links for a specific resource
 */
export const useShareLinks = (resourceType: string, resourceId: number) => {
  return useQuery({
    queryKey: shareQueryKeys.list(resourceType, resourceId),
    queryFn: async () => {
      const response = await getShareLinksForResource(resourceType, resourceId);
      return response?.data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!resourceType && !!resourceId,
  });
};

/**
 * Hook to fetch a share link by token (public)
 */
export const useShareLinkByToken = (token: string) => {
  return useQuery({
    queryKey: shareQueryKeys.detail(token),
    queryFn: async () => {
      const response = await getShareLinkByToken(token);
      return response?.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!token,
  });
};

/**
 * Hook to create a new share link
 */
export const useCreateShareLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateShareLinkParams) => {
      const response = await createShareLink(params);
      return response?.data;
    },
    onSuccess: (_data, variables) => {
      // Invalidate the list query for this resource
      queryClient.invalidateQueries({
        queryKey: shareQueryKeys.list(variables.resource_type, variables.resource_id),
      });
    },
  });
};

/**
 * Hook to update a share link
 */
export const useUpdateShareLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...params }: UpdateShareLinkParams & { id: number }) => {
      const response = await updateShareLink(id, params);
      return response?.data;
    },
    onSuccess: (data) => {
      // Invalidate the specific share link and the list
      if (data?.resource_type && data?.resource_id) {
        queryClient.invalidateQueries({
          queryKey: shareQueryKeys.list(data.resource_type, data.resource_id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: shareQueryKeys.all,
      });
    },
  });
};

/**
 * Hook to delete a share link
 */
export const useDeleteShareLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await deleteShareLink(id);
      return response?.data;
    },
    onSuccess: () => {
      // Invalidate all share queries
      queryClient.invalidateQueries({
        queryKey: shareQueryKeys.all,
      });
    },
  });
};
