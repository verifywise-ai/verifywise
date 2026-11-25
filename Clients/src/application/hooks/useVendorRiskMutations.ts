import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  createVendorRisk,
  updateVendorRisk,
  deleteVendorRisk,
  getVendorRiskById,
  restoreVendorRisk,
} from "../repository/vendorRisk.repository";
import { vendorRiskQueryKeys } from "./useVendorRisks";
import { VENDOR_INSIGHTS_KEY } from "./useRiskLinks";
import { OWN_ERROR_MESSAGE } from "./useVendors";

/**
 * A vendor risk write changes the list and the insight reports (reach,
 * duplicates, coverage), wherever it was made: the Vendors page or a vendor's
 * risk dialog.
 */
const refreshAfterVendorRiskWrite = (
  queryClient: ReturnType<typeof useQueryClient>,
  listKey: readonly unknown[] = vendorRiskQueryKeys.lists(),
) => {
  queryClient.invalidateQueries({ queryKey: listKey });
  queryClient.invalidateQueries({ queryKey: VENDOR_INSIGHTS_KEY });
};

// Hook to create a new vendor risk
export const useCreateVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (riskData: any) => {
      const response = await createVendorRisk({ body: riskData, config: OWN_ERROR_MESSAGE });
      return response;
    },
    onSuccess: () => refreshAfterVendorRiskWrite(queryClient),
  });
};

// Hook to update a vendor risk
export const useUpdateVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await updateVendorRisk({ id, body: data, config: OWN_ERROR_MESSAGE });
      return response;
    },
    onSuccess: () => refreshAfterVendorRiskWrite(queryClient),
  });
};

// Hook to delete a vendor risk
export const useDeleteVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await deleteVendorRisk({ id, config: OWN_ERROR_MESSAGE });
      return response;
    },
    onSuccess: () => refreshAfterVendorRiskWrite(queryClient),
  });
};

// Restore a deleted vendor risk; lists and the risk itself refetch.
export const useRestoreVendorRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => restoreVendorRisk({ id }),
    onSuccess: () => refreshAfterVendorRiskWrite(queryClient, vendorRiskQueryKeys.all),
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
