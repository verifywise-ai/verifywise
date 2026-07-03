import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
  assignModelTier,
  createFinding,
  createValidation,
  getFindings,
  getFleetTiering,
  getModelRoles,
  getValidations,
  setModelRoles,
  signoffValidation,
  updateFinding,
  updateValidation,
} from "../repository/mrm.repository";
import {
  IAssignTierPayload,
  ICreateFindingPayload,
  ICreateValidationPayload,
  IMrmFinding,
  IMrmFleetRow,
  IMrmModelRole,
  IMrmValidation,
  IRoleAssignment,
  ISignoffValidationPayload,
  IUpdateFindingPayload,
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
