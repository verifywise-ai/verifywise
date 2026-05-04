import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  createVendorRisk,
  updateVendorRisk,
  deleteVendorRisk,
  getVendorRiskById,
} from "../repository/vendorRisk.repository";
import { vendorRiskQueryKeys } from "./useVendorRisks";

// Hook to create a new vendor risk
export const useCreateVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (riskData: any) => {
      const response = await createVendorRisk({ body: riskData });
      return response;
    },
    onSuccess: () => {
      // Invalidate and refetch vendor risks
      queryClient.invalidateQueries({ queryKey: vendorRiskQueryKeys.lists() });
    },
  });
};

// Hook to update a vendor risk
export const useUpdateVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await updateVendorRisk({ id, body: data });
      return response;
    },
    onSuccess: () => {
      // Invalidate and refetch vendor risks
      queryClient.invalidateQueries({ queryKey: vendorRiskQueryKeys.lists() });
    },
  });
};

// Hook to delete a vendor risk
export const useDeleteVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await deleteVendorRisk({ id });
      return response;
    },
    onSuccess: () => {
      // Invalidate and refetch vendor risks
      queryClient.invalidateQueries({ queryKey: vendorRiskQueryKeys.lists() });
    },
  });
};

// Hook to fetch a single vendor risk by ID
export const useVendorRisk = (id: number) => {
  return useQuery({
    queryKey: [...vendorRiskQueryKeys.all, "detail", id],
    queryFn: async () => {
      const response = await getVendorRiskById({ id });
      return response?.data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
