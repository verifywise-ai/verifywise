/**
 * React Query hooks for the Controls Hub feature.
 *
 * Every query keys itself under `["masterControls", ...]` so the page can
 * invalidate a single namespace after mutations.
 *
 * - `useMasterControls()` — list view data.
 * - `useMasterControl(id)` — single master control (includes mappings if
 *   the server enriches them).
 * - `useMasterControlMappings(id)` — explicit mappings list, used by the
 *   drawer's Mappings tab.
 * - `useMasterControlMutations()` — create/update/delete + mapping mutations
 *   exposed as a single object so callers pick what they need.
 * - `usePropagationPreview()` — on-demand preview invocation (query kept
 *   disabled until the caller supplies a payload).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  addMasterControlMapping,
  bulkUpdateMasterControls,
  createMasterControl,
  deleteMasterControl,
  deleteMasterControlMapping,
  getAllMasterControls,
  getMasterControlById,
  getMasterControlMappings,
  getMasterControlPropagationPreview,
  updateMasterControl,
  type BulkUpdateResponse,
  type MasterControlBulkUpdatePayload,
  type MasterControlCreatePayload,
  type MasterControlMappingCreatePayload,
  type MasterControlUpdatePayload,
  type PropagationPreviewPayload,
} from "../repository/masterControl.repository";
import {
  MasterControlModel,
  type MasterControlFrameworkMapping,
} from "../../domain/models/Common/masterControl/masterControl.model";

const ROOT_KEY = "masterControls" as const;

export const masterControlKeys = {
  all: [ROOT_KEY] as const,
  list: () => [ROOT_KEY, "list"] as const,
  detail: (id: number) => [ROOT_KEY, "detail", id] as const,
  mappings: (id: number) => [ROOT_KEY, "mappings", id] as const,
};

// ---------- Queries ----------

export function useMasterControls() {
  return useQuery({
    queryKey: masterControlKeys.list(),
    queryFn: async ({ signal }) => {
      const response = await getAllMasterControls({ signal });
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
        ? response
        : [];
      return rows.map((row: any) => MasterControlModel.fromApiData(row));
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useMasterControl(id: number | null | undefined) {
  return useQuery({
    queryKey: id ? masterControlKeys.detail(id) : [ROOT_KEY, "detail", "none"],
    enabled: typeof id === "number" && id > 0,
    queryFn: async ({ signal }) => {
      if (typeof id !== "number") return null;
      const response = await getMasterControlById({ id, signal });
      return MasterControlModel.fromApiData(response?.data ?? response);
    },
  });
}

export function useMasterControlMappings(id: number | null | undefined) {
  return useQuery({
    queryKey: id
      ? masterControlKeys.mappings(id)
      : [ROOT_KEY, "mappings", "none"],
    enabled: typeof id === "number" && id > 0,
    queryFn: async ({ signal }) => {
      if (typeof id !== "number") return [] as MasterControlFrameworkMapping[];
      const response = await getMasterControlMappings({ id, signal });
      const rows = response?.data ?? response;
      return Array.isArray(rows)
        ? (rows as MasterControlFrameworkMapping[])
        : [];
    },
  });
}

// ---------- Mutations ----------

export interface MasterControlMutations {
  create: UseMutationResult<any, Error, MasterControlCreatePayload>;
  update: UseMutationResult<
    any,
    Error,
    { id: number; body: MasterControlUpdatePayload }
  >;
  remove: UseMutationResult<any, Error, { id: number }>;
  bulkUpdate: UseMutationResult<
    BulkUpdateResponse,
    Error,
    MasterControlBulkUpdatePayload
  >;
  addMapping: UseMutationResult<
    any,
    Error,
    { id: number; body: MasterControlMappingCreatePayload }
  >;
  removeMapping: UseMutationResult<any, Error, { mappingId: number; masterId?: number }>;
  invalidateAll: () => Promise<void>;
}

export function useMasterControlMutations(): MasterControlMutations {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: masterControlKeys.all });
  }, [queryClient]);

  const create = useMutation({
    mutationFn: (body: MasterControlCreatePayload) =>
      createMasterControl({ body }),
    onSuccess: invalidateAll,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: MasterControlUpdatePayload;
    }) => updateMasterControl({ id, body }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: masterControlKeys.list() });
      queryClient.invalidateQueries({
        queryKey: masterControlKeys.detail(variables.id),
      });
    },
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: number }) => deleteMasterControl({ id }),
    onSuccess: invalidateAll,
  });

  const bulkUpdate = useMutation({
    mutationFn: (body: MasterControlBulkUpdatePayload) =>
      bulkUpdateMasterControls({ body }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: masterControlKeys.list() });
      for (const id of variables.ids) {
        queryClient.invalidateQueries({
          queryKey: masterControlKeys.detail(id),
        });
      }
    },
  });

  const addMapping = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: MasterControlMappingCreatePayload;
    }) => addMasterControlMapping({ id, body }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({
        queryKey: masterControlKeys.mappings(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: masterControlKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: masterControlKeys.list() });
    },
  });

  const removeMapping = useMutation({
    mutationFn: ({ mappingId }: { mappingId: number; masterId?: number }) =>
      deleteMasterControlMapping({ mappingId }),
    onSuccess: (_res, variables) => {
      if (variables.masterId) {
        queryClient.invalidateQueries({
          queryKey: masterControlKeys.mappings(variables.masterId),
        });
        queryClient.invalidateQueries({
          queryKey: masterControlKeys.detail(variables.masterId),
        });
      }
      queryClient.invalidateQueries({ queryKey: masterControlKeys.list() });
    },
  });

  return {
    create,
    update,
    remove,
    bulkUpdate,
    addMapping,
    removeMapping,
    invalidateAll,
  };
}

// ---------- Propagation preview ----------

export function usePropagationPreview() {
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: PropagationPreviewPayload;
    }) => getMasterControlPropagationPreview({ id, body }),
  });
}
