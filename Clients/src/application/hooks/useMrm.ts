import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
  assignModelTier,
  createFinding,
  createIngestionToken,
  createMetricKey,
  createThreshold,
  createValidation,
  deleteThreshold,
  getAttestationSummary,
  getFindings,
  getFleetTiering,
  getIngestionTokens,
  getMetricKeys,
  getMetricTrend,
  getModelBreaches,
  getModelMonitoring,
  getModelRoles,
  getMrmSettings,
  getRevalidationEvents,
  getThresholds,
  getValidations,
  revokeIngestionToken,
  rotateIngestionToken,
  setModelRoles,
  signoffValidation,
  updateFinding,
  updateMrmSettings,
  updateThreshold,
  updateValidation,
} from "../repository/mrm.repository";
import {
  IAssignTierPayload,
  ICreateFindingPayload,
  ICreateIngestionTokenPayload,
  ICreateMetricKeyPayload,
  ICreateThresholdPayload,
  ICreateValidationPayload,
  ICreatedIngestionToken,
  IMrmAttestationSummary,
  IMrmBreachHistoryRow,
  IMrmFinding,
  IMrmFleetRow,
  IMrmIngestionToken,
  IMrmMetricKey,
  IMrmModelRole,
  IMrmMonitoringRow,
  IMrmOrgSettings,
  IMrmRevalidationEvent,
  IMrmThreshold,
  IMrmTrendPoint,
  IMrmValidation,
  IRoleAssignment,
  ISignoffValidationPayload,
  IUpdateFindingPayload,
  IUpdateThresholdPayload,
  IUpdateValidationPayload,
} from "../../domain/interfaces/i.mrm";

export const mrmQueryKeys = {
  all: ["mrm"] as const,
  tiering: () => [...mrmQueryKeys.all, "tiering"] as const,
  validations: (modelId?: number) =>
    [...mrmQueryKeys.all, "validations", modelId ?? "all"] as const,
  findings: (filters?: { modelId?: number; validationId?: number }) =>
    [
      ...mrmQueryKeys.all,
      "findings",
      filters?.modelId ?? "all",
      filters?.validationId ?? "all",
    ] as const,
  roles: (modelId: number | null) => [...mrmQueryKeys.all, "roles", modelId ?? -1] as const,
  monitoring: (modelId: number | null) =>
    [...mrmQueryKeys.all, "monitoring", modelId ?? -1] as const,
  breaches: (modelId: number | null) => [...mrmQueryKeys.all, "breaches", modelId ?? -1] as const,
  trend: (modelId: number | null, metric: string) =>
    [...mrmQueryKeys.all, "trend", modelId ?? -1, metric] as const,
  ingestionTokens: () => [...mrmQueryKeys.all, "ingestion-tokens"] as const,
  thresholds: (filters?: { modelId?: number; metric?: string }) =>
    [
      ...mrmQueryKeys.all,
      "thresholds",
      filters?.modelId ?? "all",
      filters?.metric ?? "all",
    ] as const,
  metricKeys: () => [...mrmQueryKeys.all, "metric-keys"] as const,
  attestationSummary: () => [...mrmQueryKeys.all, "attestation-summary"] as const,
  revalidationEvents: (modelId: number | null) =>
    [...mrmQueryKeys.all, "revalidation-events", modelId ?? -1] as const,
  settings: () => [...mrmQueryKeys.all, "settings"] as const,
};

const STALE_TIME = 2 * 60 * 1000;
const GC_TIME = 5 * 60 * 1000;

// ---- Tiering ----

export const useFleetTiering = (): UseQueryResult<IMrmFleetRow[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.tiering(),
    queryFn: async ({ signal }) => await getFleetTiering(signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useAssignModelTier = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ modelId, payload }: { modelId: number; payload: IAssignTierPayload }) =>
      await assignModelTier(modelId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

// ---- Validations ----

export const useValidations = (modelId?: number): UseQueryResult<IMrmValidation[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.validations(modelId),
    queryFn: async ({ signal }) => await getValidations(modelId, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useCreateValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      payload,
    }: {
      modelId: number;
      payload: ICreateValidationPayload;
    }) => await createValidation(modelId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

export const useUpdateValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: IUpdateValidationPayload }) =>
      await updateValidation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

export const useSignoffValidation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: ISignoffValidationPayload }) =>
      await signoffValidation(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

// ---- Findings ----

export const useFindings = (filters?: {
  modelId?: number;
  validationId?: number;
}): UseQueryResult<IMrmFinding[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.findings(filters),
    queryFn: async ({ signal }) => await getFindings(filters, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useCreateFinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      validationId,
      payload,
    }: {
      validationId: number;
      payload: ICreateFindingPayload;
    }) => await createFinding(validationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

export const useUpdateFinding = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: IUpdateFindingPayload }) =>
      await updateFinding(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

// ---- Per-model roles ----

export const useModelRoles = (modelId: number | null): UseQueryResult<IMrmModelRole[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.roles(modelId),
    queryFn: async ({ signal }) => {
      if (!modelId) return [];
      return await getModelRoles(modelId, signal);
    },
    enabled: !!modelId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useSetModelRoles = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      assignments,
    }: {
      modelId: number;
      assignments: IRoleAssignment[];
    }) => await setModelRoles(modelId, assignments),
    onSuccess: (_data, { modelId }) => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.roles(modelId ?? null) });
    },
  });
};

// ---- Branch 2: monitoring (read) ----

export const useModelMonitoring = (
  modelId: number | null,
): UseQueryResult<IMrmMonitoringRow[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.monitoring(modelId),
    queryFn: async ({ signal }) => {
      if (!modelId) return [];
      return await getModelMonitoring(modelId, signal);
    },
    enabled: !!modelId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useMetricTrend = (
  modelId: number | null,
  metric: string,
): UseQueryResult<IMrmTrendPoint[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.trend(modelId, metric),
    queryFn: async ({ signal }) => {
      if (!modelId || !metric) return [];
      return await getMetricTrend(modelId, metric, signal);
    },
    enabled: !!modelId && !!metric,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useModelBreaches = (
  modelId: number | null,
): UseQueryResult<IMrmBreachHistoryRow[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.breaches(modelId),
    queryFn: async ({ signal }) => {
      if (!modelId) return [];
      return await getModelBreaches(modelId, signal);
    },
    enabled: !!modelId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

// ---- Branch 2: ingestion tokens ----

export const useIngestionTokens = (): UseQueryResult<IMrmIngestionToken[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.ingestionTokens(),
    queryFn: async ({ signal }) => await getIngestionTokens(signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useCreateIngestionToken = () => {
  const queryClient = useQueryClient();
  return useMutation<ICreatedIngestionToken, Error, ICreateIngestionTokenPayload>({
    mutationFn: async (payload) => await createIngestionToken(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.ingestionTokens() });
    },
  });
};

export const useRotateIngestionToken = () => {
  const queryClient = useQueryClient();
  return useMutation<ICreatedIngestionToken, Error, number>({
    mutationFn: async (id) => await rotateIngestionToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.ingestionTokens() });
    },
  });
};

export const useRevokeIngestionToken = () => {
  const queryClient = useQueryClient();
  return useMutation<IMrmIngestionToken, Error, number>({
    mutationFn: async (id) => await revokeIngestionToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.ingestionTokens() });
    },
  });
};

// ---- Branch 2: thresholds ----

export const useThresholds = (filters?: {
  modelId?: number;
  metric?: string;
}): UseQueryResult<IMrmThreshold[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.thresholds(filters),
    queryFn: async ({ signal }) => await getThresholds(filters, signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useCreateThreshold = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      payload,
    }: {
      modelId: number;
      payload: ICreateThresholdPayload;
    }) => await createThreshold(modelId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

export const useUpdateThreshold = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: IUpdateThresholdPayload }) =>
      await updateThreshold(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

export const useDeleteThreshold = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => await deleteThreshold(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.all });
    },
  });
};

// ---- Branch 2: metric keys ----

export const useMetricKeys = (): UseQueryResult<IMrmMetricKey[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.metricKeys(),
    queryFn: async ({ signal }) => await getMetricKeys(signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useCreateMetricKey = () => {
  const queryClient = useQueryClient();
  return useMutation<IMrmMetricKey, Error, ICreateMetricKeyPayload>({
    mutationFn: async (payload) => await createMetricKey(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.metricKeys() });
    },
  });
};

// ---- Branch 3: revalidation events + attestation ----

export const useAttestationSummary = (): UseQueryResult<IMrmAttestationSummary, Error> =>
  useQuery({
    queryKey: mrmQueryKeys.attestationSummary(),
    queryFn: async ({ signal }) => await getAttestationSummary(signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useRevalidationEvents = (
  modelId: number | null,
): UseQueryResult<IMrmRevalidationEvent[], Error> =>
  useQuery({
    queryKey: mrmQueryKeys.revalidationEvents(modelId),
    queryFn: async ({ signal }) => {
      if (!modelId) return [];
      return await getRevalidationEvents(modelId, signal);
    },
    enabled: !!modelId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

// ---- Org-wide MRM settings (metric retention) ----

export const useMrmSettings = (): UseQueryResult<IMrmOrgSettings, Error> =>
  useQuery({
    queryKey: mrmQueryKeys.settings(),
    queryFn: async ({ signal }) => await getMrmSettings(signal),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useUpdateMrmSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (retention_months: number) => await updateMrmSettings(retention_months),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mrmQueryKeys.settings() });
    },
  });
};
