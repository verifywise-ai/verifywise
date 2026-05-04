/**
 * Custom hook to fetch and manage vendor risks data using TanStack Query.
 *
 * @param {Object} params - The parameters object.
 * @param {string} [params.projectId] - The optional project ID to filter vendor risks.
 * @param {string} [params.vendorId] - The optional vendor ID to filter vendor risks.
 * @returns {Object} - The hook returns an object containing:
 *   - `vendorRisks` {VendorRisk[]} - The list of vendor risks.
 *   - `loadingVendorRisks` {boolean} - The loading state of the vendor risks.
 *   - `error` {string | boolean} - The error state of the vendor risks request.
 *   - `vendorRisksSummary` {Object} - The summary of vendor risks categorized by risk levels.
 *   - `refetchVendorRisks` {Function} - Function to manually refetch vendor risks data.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { convertToCamelCaseRiskKey } from "../tools/stringUtil";
import { VendorRisk } from "../../domain/types/VendorRisk";
import { getAllVendorRisks } from "../repository/vendorRisk.repository";

// Query keys for vendor risks
export const vendorRiskQueryKeys = {
  all: ["vendorRisks"] as const,
  lists: () => [...vendorRiskQueryKeys.all, "list"] as const,
  list: (filters: {
    projectId?: string | null;
    vendorId?: string | null;
    filter?: "active" | "deleted" | "all";
  }) => [...vendorRiskQueryKeys.lists(), filters] as const,
};

const useVendorRisks = ({
  projectId,
  vendorId,
  filter = "active",
}: {
  projectId?: string | null;
  vendorId?: string | null;
  filter?: "active" | "deleted" | "all";
}) => {
  const {
    data: vendorRisks = [],
    isLoading: loadingVendorRisks,
    error,
    refetch: refetchVendorRisks,
  } = useQuery({
    queryKey: vendorRiskQueryKeys.list({ projectId, vendorId, filter }),
    queryFn: async (): Promise<VendorRisk[]> => {
      const response = await getAllVendorRisks({ filter });
      return response?.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Filter risks based on projectId and vendorId
  const filteredVendorRisks = useMemo(() => {
    return vendorRisks.filter((risk) => {
      const matchesProject =
        !projectId || projectId === "all" || risk.project_id?.toString() === projectId;
      const matchesVendor =
        !vendorId || vendorId === "all" || risk.vendor_id?.toString() === vendorId;
      return matchesProject && matchesVendor;
    });
  }, [vendorRisks, projectId, vendorId]);

  const vendorRisksSummary = useMemo(() => {
    return filteredVendorRisks.reduce(
      (acc, risk) => {
        const _risk = convertToCamelCaseRiskKey(risk.risk_level);
        const key = `${_risk.replace(/risks?$/i, "")}Risks`;
        if (key in acc && key !== "total") {
          const riskKey = key as
            | "veryHighRisks"
            | "highRisks"
            | "mediumRisks"
            | "lowRisks"
            | "veryLowRisks";
          acc[riskKey] = acc[riskKey] + 1;
        }
        acc.total = acc.total + 1;
        return acc;
      },
      {
        total: 0,
        veryHighRisks: 0,
        highRisks: 0,
        mediumRisks: 0,
        lowRisks: 0,
        veryLowRisks: 0,
      },
    );
  }, [filteredVendorRisks]);

  return {
    loadingVendorRisks,
    error: error ? `Request failed: ${error.message}` : false,
    vendorRisks: filteredVendorRisks,
    vendorRisksSummary,
    refetchVendorRisks,
  };
};

export default useVendorRisks;
