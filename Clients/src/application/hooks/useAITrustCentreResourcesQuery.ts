import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAITrustCentreResources,
  createAITrustCentreResource,
  deleteAITrustCentreResource,
  updateAITrustCentreResource,
} from "../repository/aiTrustCentre.repository";

export interface AITrustCentreResource {
  id: number;
  name: string;
  description: string;
  visible: boolean;
  file_id: number;
  filename?: string;
  updated_at: string;
}

// Query key for resources data
export const resourcesQueryKey = ["aiTrustCentre", "resources"] as const;

// Hook for fetching resources data
export const useAITrustCentreResourcesQuery = () => {
  return useQuery({
    queryKey: resourcesQueryKey,
    queryFn: async () => {
      const response = await getAITrustCentreResources();
      // Handle nested response structure
      const resources =
        response?.data?.data?.resources || response?.data?.resources || response?.resources || [];
      return resources as AITrustCentreResource[];
    },
    // Uses default options from QueryClient
  });
};

// Hook for creating a new resource
export const useCreateAITrustCentreResourceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      name,
      description,
      visible,
    }: {
      file: File;
      name: string;
      description: string;
      visible?: boolean;
    }) => {
      return await createAITrustCentreResource(file, name, description, visible);
    },
    onSuccess: () => {
      // Invalidate and refetch resources data
      queryClient.invalidateQueries({ queryKey: resourcesQueryKey });
    },
    onError: (error: any) => {
      console.error("Error creating AI Trust Centre resource:", error);
    },
  });
};

// Hook for updating a resource
export const useUpdateAITrustCentreResourceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      resourceId,
      name,
      description,
      visible,
      file,
      oldFileId,
    }: {
      resourceId: number;
      name: string;
      description: string;
      visible: boolean;
      file?: File;
      oldFileId?: number;
    }) => {
      return await updateAITrustCentreResource(
        resourceId,
        name,
        description,
        visible,
        file,
        oldFileId,
      );
    },
    onSuccess: () => {
      // Invalidate and refetch resources data
      queryClient.invalidateQueries({ queryKey: resourcesQueryKey });
    },
    onError: (error: any) => {
      console.error("Error updating AI Trust Centre resource:", error);
    },
  });
};

// Hook for deleting a resource
export const useDeleteAITrustCentreResourceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (resourceId: number) => {
      return await deleteAITrustCentreResource(resourceId);
    },
    onSuccess: () => {
      // Invalidate and refetch resources data
      queryClient.invalidateQueries({ queryKey: resourcesQueryKey });
    },
    onError: (error: any) => {
      console.error("Error deleting AI Trust Centre resource:", error);
    },
  });
};
