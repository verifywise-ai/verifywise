import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllMappings,
  getMappingsBetween,
  createMapping,
  updateMapping,
  deleteMapping,
  createBulkMappings,
  getAllScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  activateScenario,
  simulateScenario,
  getActivationHistory,
  deactivateScenario,
  getScenarioProgress,
  getRecommendations,
  getCoverage,
  refreshCoverage,
  getUnifiedView,
  getPreferences,
  updatePreferences,
} from "../repository/governanceOs.repository";
import {
  IGovernanceControlMapping,
  IGovernanceScenario,
  IGovernanceCoverage,
  IRecommendationResult,
  IUnifiedView,
  IGovernanceOrgPreferences,
  IRecommendationRequest,
} from "../../domain/interfaces/i.governanceOs";

export const governanceOsQueryKeys = {
  all: ["governance-os"] as const,
  mappings: () => [...governanceOsQueryKeys.all, "mappings"] as const,
  mappingsFiltered: (filters: Record<string, unknown>) =>
    [...governanceOsQueryKeys.mappings(), filters] as const,
  mappingsBetween: (sourceId: number, targetId: number) =>
    [...governanceOsQueryKeys.mappings(), "between", sourceId, targetId] as const,
  scenarios: () => [...governanceOsQueryKeys.all, "scenarios"] as const,
  coverage: (projectId: number) => [...governanceOsQueryKeys.all, "coverage", projectId] as const,
  unifiedView: (projectId: number) =>
    [...governanceOsQueryKeys.all, "unified-view", projectId] as const,
  preferences: () => [...governanceOsQueryKeys.all, "preferences"] as const,
};

export const useCreateMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IGovernanceControlMapping>) => createMapping({ body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.mappings() });
    },
  });
};

export const useUpdateMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<IGovernanceControlMapping> }) =>
      updateMapping({ id, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.mappings() });
    },
  });
};

export const useDeleteMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMapping({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.mappings() });
    },
  });
};

export const useBulkCreateMappings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mappings: Partial<IGovernanceControlMapping>[]) =>
      createBulkMappings({ body: { mappings } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.mappings() });
    },
  });
};

export const useActivateScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => activateScenario({ id, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.scenarios() });
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.preferences() });
    },
  });
};

export const useSimulateScenario = () => {
  return useMutation({
    mutationFn: async (body: any) => {
      const response = await simulateScenario({ body });
      return response?.data ?? response;
    },
  });
};

export const useActivationHistory = () => {
  return useQuery({
    queryKey: [...governanceOsQueryKeys.all, "activations"],
    queryFn: async () => {
      const response = await getActivationHistory();
      return response?.data?.activations || [];
    },
    staleTime: 2 * 60 * 1000,
  });
};

export const useDeactivateScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deactivateScenario({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...governanceOsQueryKeys.all, "activations"] });
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.preferences() });
    },
  });
};

export const useScenarioProgress = (activationId: number) => {
  return useQuery({
    queryKey: [...governanceOsQueryKeys.all, "progress", activationId],
    queryFn: async () => {
      const response = await getScenarioProgress({ id: activationId });
      return response?.data?.frameworks || [];
    },
    enabled: activationId > 0,
    staleTime: 1 * 60 * 1000,
  });
};

export const useMappings = (filters?: {
  frameworkId?: number;
  strength?: string;
  domain?: string;
}) => {
  return useQuery<IGovernanceControlMapping[]>({
    queryKey: governanceOsQueryKeys.mappingsFiltered(filters || {}),
    queryFn: async () => {
      const response = await getAllMappings(filters);
      return response?.data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useMappingsBetween = (sourceId: number, targetId: number) => {
  return useQuery<IGovernanceControlMapping[]>({
    queryKey: governanceOsQueryKeys.mappingsBetween(sourceId, targetId),
    queryFn: async () => {
      const response = await getMappingsBetween({ sourceId, targetId });
      return response?.data || [];
    },
    enabled: sourceId > 0 && targetId > 0,
    staleTime: 10 * 60 * 1000,
  });
};

export const useScenarios = () => {
  return useQuery<IGovernanceScenario[]>({
    queryKey: governanceOsQueryKeys.scenarios(),
    queryFn: async () => {
      const response = await getAllScenarios();
      return response?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IGovernanceScenario>) => createScenario({ body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.scenarios() });
    },
  });
};

export const useUpdateScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<IGovernanceScenario> }) =>
      updateScenario({ id, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.scenarios() });
    },
  });
};

export const useDeleteScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteScenario({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.scenarios() });
    },
  });
};

export const useGovernanceRecommendations = () => {
  return useMutation<IRecommendationResult[], Error, IRecommendationRequest>({
    mutationFn: (body: IRecommendationRequest) =>
      getRecommendations({ body }).then((r) => r?.data || []),
  });
};

export const useCoverage = (projectId: number) => {
  return useQuery<IGovernanceCoverage[]>({
    queryKey: governanceOsQueryKeys.coverage(projectId),
    queryFn: async () => {
      const response = await getCoverage({ projectId });
      return response?.data || [];
    },
    enabled: projectId > 0,
    staleTime: 5 * 60 * 1000,
  });
};

export const useRefreshCoverage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) => refreshCoverage({ projectId }),
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.coverage(projectId) });
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.unifiedView(projectId) });
    },
  });
};

export const useUnifiedView = (projectId: number) => {
  return useQuery<IUnifiedView>({
    queryKey: governanceOsQueryKeys.unifiedView(projectId),
    queryFn: async () => {
      const response = await getUnifiedView({ projectId });
      return response?.data;
    },
    enabled: projectId > 0,
    staleTime: 5 * 60 * 1000,
  });
};

export const useGovernancePreferences = () => {
  return useQuery<IGovernanceOrgPreferences | null>({
    queryKey: governanceOsQueryKeys.preferences(),
    queryFn: async () => {
      const response = await getPreferences();
      return response?.data || null;
    },
  });
};

export const useUpdatePreferences = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<IGovernanceOrgPreferences>) => updatePreferences({ body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: governanceOsQueryKeys.preferences() });
    },
  });
};
