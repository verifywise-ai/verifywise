import { useQuery, useMutation, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
  getAllAiApps,
  getAiAppById,
  createAiApp,
  updateAiApp,
  updateAiAppStatus,
  deleteAiApp,
  linkModelsToAiApp,
  setPoliciesForAiApp,
  setDataExposureForAiApp,
  getPolicySuggestions,
  promoteFromShadowAi,
  getProjectAiApps,
  getCreateAiAppPreview,
  createAiAppFromUseCase,
  getAiAppUseCases,
  linkUseCaseToAiApp,
  unlinkUseCaseFromAiApp,
} from "../repository/aiApp.repository";
import {
  IAIAppCreatePayload,
  IAIAppListResponse,
  IAIAppUpdatePayload,
  IGetAiAppsFilters,
} from "../../domain/interfaces/i.aiApp";
import { AiAppStatus } from "../../domain/enums/aiApp.enum";

export const aiAppQueryKeys = {
  all: ["aiApps"] as const,
  lists: () => [...aiAppQueryKeys.all, "list"] as const,
  /** Lifecycle summary and per-app state (#5193); see useAiAppLifecycle. */
  lifecycle: () => [...aiAppQueryKeys.all, "lifecycle"] as const,
  list: (filters: IGetAiAppsFilters) => [...aiAppQueryKeys.lists(), filters] as const,
  details: () => [...aiAppQueryKeys.all, "detail"] as const,
  detail: (id: number) => [...aiAppQueryKeys.details(), id] as const,
  policySuggestions: (name: string) => [...aiAppQueryKeys.all, "policySuggestions", name] as const,
  /** AI apps linked to one use case (#5259). */
  byProject: (projectId: number) => [...aiAppQueryKeys.all, "byProject", projectId] as const,
  /** What creating an AI app from a use case would copy (#5259). */
  createPreview: (projectId: number) =>
    [...aiAppQueryKeys.all, "createPreview", projectId] as const,
  /** Use cases linked to one AI app (#5259). */
  useCases: (id: number) => [...aiAppQueryKeys.all, "useCases", id] as const,
};

export const useAiApps = (
  filters: IGetAiAppsFilters = {},
): UseQueryResult<IAIAppListResponse, Error> => {
  return useQuery({
    queryKey: aiAppQueryKeys.list(filters),
    queryFn: async ({ signal }) => {
      return await getAllAiApps(filters, signal);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useAiApp = (id: number | null) => {
  return useQuery({
    queryKey: aiAppQueryKeys.detail(id ?? 0),
    queryFn: async ({ signal }) => {
      if (!id) return null;
      return await getAiAppById(id, signal);
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useCreateAiApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: IAIAppCreatePayload) => {
      return await createAiApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};

export const useUpdateAiApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: IAIAppUpdatePayload }) => {
      return await updateAiApp(id, data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};

export const useUpdateAiAppStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: AiAppStatus }) => {
      return await updateAiAppStatus(id, status);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};

export const useDeleteAiApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      return await deleteAiApp(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};

export const useLinkModelsToAiApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, modelInventoryIds }: { id: number; modelInventoryIds: number[] }) => {
      return await linkModelsToAiApp(id, modelInventoryIds);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};

export const useSetPoliciesForAiApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      policies,
    }: {
      id: number;
      policies: Array<{ policy_id: number; status: string }>;
    }) => {
      return await setPoliciesForAiApp(id, policies);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.detail(id) });
    },
  });
};

export const useSetDataExposureForAiApp = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      dataExposure,
    }: {
      id: number;
      dataExposure: Array<{ data_type: string; allowed: boolean }>;
    }) => {
      return await setDataExposureForAiApp(id, dataExposure);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.detail(id) });
    },
  });
};

export const usePolicySuggestions = (name: string) => {
  return useQuery({
    queryKey: aiAppQueryKeys.policySuggestions(name),
    queryFn: async ({ signal }) => {
      if (!name || name.trim().length === 0) return [];
      return await getPolicySuggestions(name, signal);
    },
    enabled: name.trim().length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

export const useProjectAiApps = (projectId: number) => {
  return useQuery({
    queryKey: aiAppQueryKeys.byProject(projectId),
    queryFn: ({ signal }) => getProjectAiApps(projectId, signal),
    staleTime: 60 * 1000,
  });
};

export const useCreateAiAppPreview = (projectId: number, enabled: boolean) => {
  return useQuery({
    queryKey: aiAppQueryKeys.createPreview(projectId),
    queryFn: ({ signal }) => getCreateAiAppPreview(projectId, signal),
    enabled,
    staleTime: 0,
  });
};

export const useCreateAiAppFromUseCase = (projectId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createAiAppFromUseCase(projectId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.byProject(projectId) });
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};

export const useAiAppUseCases = (id: number) => {
  return useQuery({
    queryKey: aiAppQueryKeys.useCases(id),
    queryFn: ({ signal }) => getAiAppUseCases(id, signal),
    staleTime: 60 * 1000,
  });
};

export const useLinkUseCaseToAiApp = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: number) => linkUseCaseToAiApp(id, projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.useCases(id) });
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.byProject(projectId) });
    },
  });
};

export const useUnlinkUseCaseFromAiApp = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: number) => unlinkUseCaseFromAiApp(id, projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.useCases(id) });
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.byProject(projectId) });
    },
  });
};

export const usePromoteFromShadowAi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shadowAiToolId: number) => {
      return await promoteFromShadowAi(shadowAiToolId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
      // Tab counts, stale markers and the lifecycle stage follow status and existence.
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lifecycle() });
    },
  });
};
