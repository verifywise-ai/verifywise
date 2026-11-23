import { useQuery, useMutation, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
  getAllVendors,
  getVendorById,
  getVendorsByProjectId,
  createNewVendor,
  update as updateVendor,
  deleteVendor,
} from "../repository/vendor.repository";
import { VendorModel } from "../../domain/models/Common/vendor/vendor.model";
import { VENDOR_RESEARCH_KEY } from "./useVendorResearch";
import { VENDOR_INSIGHTS_KEY } from "./useRiskLinks";
import { vendorRiskQueryKeys } from "./useVendorRisks";

/**
 * The vendor modal and the Vendors page show their own message for a failed
 * write, so the global error toast would be a second one.
 */
export const OWN_ERROR_MESSAGE = { suppressGlobalErrorToast: true } as const;

// Query keys for vendors
export const vendorQueryKeys = {
  all: ["vendors"] as const,
  lists: () => [...vendorQueryKeys.all, "list"] as const,
  list: (filters: { projectId?: string | number }) =>
    [...vendorQueryKeys.lists(), filters] as const,
  details: () => [...vendorQueryKeys.all, "detail"] as const,
  detail: (id: number) => [...vendorQueryKeys.details(), id] as const,
};

// Hook to fetch all vendors
export const useVendors = (
  filters: { projectId?: string | number } = {},
  options: {
    /** Skip the global error toast; the caller shows its own message. */
    suppressGlobalErrorToast?: boolean;
  } = {},
): UseQueryResult<VendorModel[], Error> => {
  const { suppressGlobalErrorToast } = options;
  return useQuery({
    queryKey: vendorQueryKeys.list(filters),
    queryFn: async () => {
      if (filters.projectId && filters.projectId !== "all") {
        const response = await getVendorsByProjectId({
          projectId: Number(filters.projectId),
          suppressGlobalErrorToast,
        });
        return response?.data || [];
      } else {
        const response = await getAllVendors({ suppressGlobalErrorToast });
        return response?.data || [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook to fetch a single vendor by ID
export const useVendor = (id: number) => {
  return useQuery({
    queryKey: vendorQueryKeys.detail(id),
    queryFn: async () => {
      const response = await getVendorById({ id });
      return response?.data;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

// Hook to create a new vendor
export const useCreateVendor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vendorData: Partial<VendorModel>) => {
      const response = await createNewVendor({ body: vendorData, config: OWN_ERROR_MESSAGE });
      return response;
    },
    onSuccess: () => {
      // Invalidate and refetch vendor lists
      queryClient.invalidateQueries({ queryKey: vendorQueryKeys.lists() });
    },
  });
};

// Hook to update a vendor
export const useUpdateVendor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<VendorModel> }) => {
      const response = await updateVendor({ id, body: data, config: OWN_ERROR_MESSAGE });
      return response;
    },
    onSuccess: (_, { id }) => {
      // Invalidate and refetch vendor details and lists
      queryClient.invalidateQueries({ queryKey: vendorQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: vendorQueryKeys.lists() });
      // A vendor's use cases feed the insights' reach and coverage, and each
      // of its risks' use case column and filter.
      queryClient.invalidateQueries({ queryKey: VENDOR_INSIGHTS_KEY });
      queryClient.invalidateQueries({ queryKey: vendorRiskQueryKeys.lists() });
    },
  });
};

// Hook to delete a vendor
export const useDeleteVendor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await deleteVendor({ id, config: OWN_ERROR_MESSAGE });
      return response;
    },
    onSuccess: () => {
      // Invalidate and refetch vendor lists; the vendor's risks went with it.
      queryClient.invalidateQueries({ queryKey: vendorQueryKeys.lists() });
      // The findings and the runs of the vendor go with it, and the Research findings tab counts them.
      queryClient.invalidateQueries({ queryKey: VENDOR_RESEARCH_KEY });
      queryClient.invalidateQueries({ queryKey: vendorRiskQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: VENDOR_INSIGHTS_KEY });
    },
  });
};
