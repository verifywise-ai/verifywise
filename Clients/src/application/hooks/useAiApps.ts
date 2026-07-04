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
  list: (filters: IGetAiAppsFilters) => [...aiAppQueryKeys.lists(), filters] as const,
  details: () => [...aiAppQueryKeys.all, "detail"] as const,
  detail: (id: number) => [...aiAppQueryKeys.details(), id] as const,
  policySuggestions: (name: string) => [...aiAppQueryKeys.all, "policySuggestions", name] as const,
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

export const usePromoteFromShadowAi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shadowAiToolId: number) => {
      return await promoteFromShadowAi(shadowAiToolId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiAppQueryKeys.lists() });
    },
  });
};
