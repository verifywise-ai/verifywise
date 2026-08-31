import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRiskLink,
  getRiskLinks,
  getSharedProjects,
  recomputeRiskLinks,
  suggestRiskHierarchy,
  updateRiskLinkStatus,
} from "../repository/riskLink.repository";
import {
  CreateRiskLinkInput,
  DismissReason,
  RiskLink,
  RiskLinkStatus,
  SharedProjectCandidate,
} from "../../domain/interfaces/i.riskLink";

const linksKey = (riskId: number) => ["riskLinks", riskId] as const;

/**
 * The API accepts one status at a time, so the "show dismissed" view is a
 * different query rather than a filter over one cached list. `status` is part of
 * the key for that reason.
 */
export function useRiskLinks(riskId: number, status?: RiskLinkStatus) {
  return useQuery<RiskLink[]>({
    queryKey: [...linksKey(riskId), status ?? "default"],
    queryFn: () => getRiskLinks(riskId, status),
    enabled: Number.isFinite(riskId),
  });
}

/** onSettled, not onSuccess: a 404 means the list on screen is stale too. */
function useInvalidateLinks(riskId: number) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: linksKey(riskId) });
}

export function useCreateRiskLink(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: (input: CreateRiskLinkInput) => createRiskLink(input),
    onSettled: invalidate,
  });
}

export function useUpdateRiskLinkStatus(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: ({
      id,
      status,
      dismissal,
    }: {
      id: number;
      status: RiskLinkStatus;
      dismissal?: { dismissReason: DismissReason; dismissNote?: string };
    }) => updateRiskLinkStatus(id, status, dismissal),
    onSettled: invalidate,
  });
}

export function useRecomputeRiskLinks(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: () => recomputeRiskLinks(),
    onSettled: invalidate,
  });
}

/**
 * The pass writes `inherits_from` suggestions across the org, so this risk's
 * own list can change even though the request names no risk. Invalidate on
 * settle for the same reason `useRecomputeRiskLinks` does.
 */
export function useSuggestRiskHierarchy(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: () => suggestRiskHierarchy(),
    onSettled: invalidate,
  });
}

/**
 * Ranking data for the link picker. `enabled` is the caller's, because the
 * picker only needs it while a cross-entity parent source is selected. Its key
 * is deliberately outside `linksKey`: creating a link does not change which
 * projects a candidate belongs to, so this must not be invalidated with the
 * link list.
 */
export function useSharedProjects(riskId: number, enabled: boolean) {
  return useQuery<SharedProjectCandidate[]>({
    queryKey: ["riskLinkSharedProjects", riskId],
    queryFn: () => getSharedProjects(riskId),
    enabled: enabled && Number.isFinite(riskId),
  });
}

