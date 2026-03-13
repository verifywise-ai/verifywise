import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  searchRiskLibrary,
  getRiskLibraryEntry,
  getRiskLibraryFilters,
  getRiskLibraryStats,
  submitRiskLibraryFeedback,
  removeRiskLibraryFeedback,
  upsertRiskLibraryCustomization,
  generateRiskTaxonomy,
  generateRiskMitigations,
  generateRiskAssessment,
  submitGenerationFeedback,
} from "../repository/riskLibrary.repository";
import {
  RiskLibrarySearchParams,
  RiskLibrarySearchResult,
  RiskLibraryEntryDetail,
  RiskLibraryFilters,
  RiskLibraryStats,
} from "../../domain/types/RiskLibrary";

// ============================================================================
// QUERY KEYS
// ============================================================================

export const riskLibraryKeys = {
  all: ["riskLibrary"] as const,
  lists: () => [...riskLibraryKeys.all, "list"] as const,
  list: (params: RiskLibrarySearchParams) =>
    [...riskLibraryKeys.lists(), params] as const,
  details: () => [...riskLibraryKeys.all, "detail"] as const,
  detail: (id: number) => [...riskLibraryKeys.details(), id] as const,
  filters: () => [...riskLibraryKeys.all, "filters"] as const,
  stats: () => [...riskLibraryKeys.all, "stats"] as const,
  feedback: (id: number) => [...riskLibraryKeys.all, "feedback", id] as const,
};

// ============================================================================
// SEARCH & READ HOOKS
// ============================================================================

export function useRiskLibrarySearch(params: RiskLibrarySearchParams) {
  return useQuery({
    queryKey: riskLibraryKeys.list(params),
    queryFn: async ({ signal }) => {
      const response = await searchRiskLibrary({ params, signal });
      return response.data as RiskLibrarySearchResult;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useRiskLibraryEntry(id: number | null) {
  return useQuery({
    queryKey: riskLibraryKeys.detail(id!),
    queryFn: async ({ signal }) => {
      const response = await getRiskLibraryEntry({ id: id!, signal });
      return response.data as RiskLibraryEntryDetail;
    },
    enabled: id !== null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRiskLibraryFilters() {
  return useQuery({
    queryKey: riskLibraryKeys.filters(),
    queryFn: async ({ signal }) => {
      const response = await getRiskLibraryFilters({ signal });
      return response.data as RiskLibraryFilters;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useRiskLibraryStats() {
  return useQuery({
    queryKey: riskLibraryKeys.stats(),
    queryFn: async ({ signal }) => {
      const response = await getRiskLibraryStats({ signal });
      return response.data as RiskLibraryStats;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// FEEDBACK MUTATIONS
// ============================================================================

export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitRiskLibraryFeedback,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: riskLibraryKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: riskLibraryKeys.feedback(variables.id),
      });
    },
  });
}

export function useRemoveFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeRiskLibraryFeedback,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: riskLibraryKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: riskLibraryKeys.feedback(variables.id),
      });
    },
  });
}

// ============================================================================
// ORG CUSTOMIZATION MUTATION
// ============================================================================

export function useUpsertCustomization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertRiskLibraryCustomization,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: riskLibraryKeys.detail(variables.id),
      });
    },
  });
}

// ============================================================================
// AI GENERATION MUTATIONS
// ============================================================================

export function useGenerateTaxonomy() {
  return useMutation({
    mutationFn: generateRiskTaxonomy,
  });
}

export function useGenerateMitigations() {
  return useMutation({
    mutationFn: generateRiskMitigations,
  });
}

export function useGenerateAssessment() {
  return useMutation({
    mutationFn: generateRiskAssessment,
  });
}

export function useSubmitGenerationFeedback() {
  return useMutation({
    mutationFn: submitGenerationFeedback,
  });
}
