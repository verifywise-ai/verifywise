import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAITrustCentreSubprocessors,
  createAITrustCentreSubprocessor,
  deleteAITrustCentreSubprocessor,
  updateAITrustCentreSubprocessor,
} from "../repository/aiTrustCentre.repository";

export interface AITrustCentreSubprocessor {
  id: number;
  name: string;
  purpose: string;
  location: string;
  url: string;
  updated_at?: string;
}

// Query key for subprocessors data
export const subprocessorsQueryKey = ["aiTrustCentre", "subprocessors"] as const;

// Hook for fetching subprocessors data
export const useAITrustCentreSubprocessorsQuery = () => {
  return useQuery({
    queryKey: subprocessorsQueryKey,
    queryFn: async () => {
      const response = await getAITrustCentreSubprocessors();
      // Handle nested response structure
      const subprocessors =
        response?.data?.data?.subprocessors ||
        response?.data?.subprocessors ||
        response?.subprocessors ||
        [];
      return subprocessors as AITrustCentreSubprocessor[];
    },
    // Uses default options from QueryClient
  });
};

// Hook for creating a new subprocessor
export const useCreateAITrustCentreSubprocessorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      purpose,
      location,
      url,
    }: {
      name: string;
      purpose: string;
      location: string;
      url: string;
    }) => {
      return await createAITrustCentreSubprocessor(name, purpose, location, url);
    },
    onSuccess: () => {
      // Invalidate and refetch subprocessors data
      queryClient.invalidateQueries({ queryKey: subprocessorsQueryKey });
    },
    onError: (error: any) => {
      console.error("Error creating AI Trust Centre subprocessor:", error);
    },
  });
};

// Hook for updating a subprocessor
export const useUpdateAITrustCentreSubprocessorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subprocessorId,
      name,
      purpose,
      location,
      url,
    }: {
      subprocessorId: number;
      name: string;
      purpose: string;
      location: string;
      url: string;
    }) => {
      return await updateAITrustCentreSubprocessor(subprocessorId, name, purpose, location, url);
    },
    onSuccess: () => {
      // Invalidate and refetch subprocessors data
      queryClient.invalidateQueries({ queryKey: subprocessorsQueryKey });
    },
    onError: (error: any) => {
      console.error("Error updating AI Trust Centre subprocessor:", error);
    },
  });
};

// Hook for deleting a subprocessor
export const useDeleteAITrustCentreSubprocessorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (subprocessorId: number) => {
      return await deleteAITrustCentreSubprocessor(subprocessorId);
    },
    onSuccess: () => {
      // Invalidate and refetch subprocessors data
      queryClient.invalidateQueries({ queryKey: subprocessorsQueryKey });
    },
    onError: (error: any) => {
      console.error("Error deleting AI Trust Centre subprocessor:", error);
    },
  });
};
