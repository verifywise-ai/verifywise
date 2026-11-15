/**
 * usePolicyTemplates — React Query hooks for the organisation-owned policy
 * template catalog (VW-CQ-09).
 *
 * Wraps the policy template repository with query/mutation hooks and cache
 * invalidation, mirroring useReporting.ts.
 *
 * @module application/hooks/usePolicyTemplates
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as repo from "../repository/policyTemplate.repository";
import type {
  PolicyTemplateCreateBody,
  PolicyTemplateFromPolicyBody,
  PolicyTemplateUpdateBody,
} from "../../domain/interfaces/i.policyTemplate";

export const policyTemplatesQueryKeys = {
  all: ["policy-templates"] as const,
  lists: () => [...policyTemplatesQueryKeys.all, "list"] as const,
  details: () => [...policyTemplatesQueryKeys.all, "detail"] as const,
  detail: (id: number) => [...policyTemplatesQueryKeys.details(), id] as const,
};

export const usePolicyTemplates = () =>
  useQuery({
    queryKey: policyTemplatesQueryKeys.lists(),
    queryFn: repo.getPolicyTemplates,
    staleTime: 5 * 60 * 1000,
  });

export const usePolicyTemplate = (id: number | undefined) =>
  useQuery({
    queryKey: policyTemplatesQueryKeys.detail(id as number),
    queryFn: () => repo.getPolicyTemplate(id as number),
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
  });

export const useCreatePolicyTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PolicyTemplateCreateBody) => repo.createPolicyTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: policyTemplatesQueryKeys.all }),
  });
};

export const useUpdatePolicyTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PolicyTemplateUpdateBody }) =>
      repo.updatePolicyTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: policyTemplatesQueryKeys.all }),
  });
};

export const useDeletePolicyTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => repo.deletePolicyTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: policyTemplatesQueryKeys.all }),
  });
};

export const useCreatePolicyTemplateFromPolicy = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PolicyTemplateFromPolicyBody) => repo.createPolicyTemplateFromPolicy(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: policyTemplatesQueryKeys.all }),
  });
};
