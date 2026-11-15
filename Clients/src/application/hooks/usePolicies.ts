import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getAllPolicies, getPolicyFolderCounts } from "../repository/policy.repository";
import { PolicyManagerModel } from "../../domain/models/Common/policy/policyManager.model";

export const policyQueryKeys = {
  all: ["policies"] as const,
  lists: () => [...policyQueryKeys.all, "list"] as const,
  list: (filters: Record<string, unknown> = {}) => [...policyQueryKeys.lists(), filters] as const,
  details: () => [...policyQueryKeys.all, "detail"] as const,
  folderCounts: () => [...policyQueryKeys.all, "folder-counts"] as const,
  detail: (id: number | string) => [...policyQueryKeys.details(), id] as const,
};

export const usePolicies = (
  options: {
    /** Skip the global error toast; the caller shows its own message. */
    suppressGlobalErrorToast?: boolean;
  } = {},
): UseQueryResult<PolicyManagerModel[], Error> => {
  const { suppressGlobalErrorToast } = options;
  return useQuery({
    queryKey: policyQueryKeys.list(),
    queryFn: async () => {
      return await getAllPolicies({ suppressGlobalErrorToast });
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/** Policies per folder for the policies folder sidebar. */
export const usePolicyFolderCounts = (): UseQueryResult<Record<number, number>, Error> =>
  useQuery({
    queryKey: policyQueryKeys.folderCounts(),
    queryFn: () => getPolicyFolderCounts(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
