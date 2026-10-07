import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeParentLevelChange,
  createRiskLink,
  getRiskLinks,
  getSharedProjects,
  getVendorDuplicateCandidates,
  getVendorExposure,
  getVendorFrameworkCoverage,
  getVendorRiskLinks,
  getVendorRiskSharedProjects,
  suggestVendorRiskHierarchy,
  recomputeRiskLinks,
  recomputeVendorRiskLinks,
  suggestRiskHierarchy,
  updateRiskLinkStatus,
} from "../repository/riskLink.repository";
import {
  CreateRiskLinkInput,
  DismissReason,
  RiskLink,
  RiskLinkStatus,
  SharedProjectCandidate,
  VendorCoverageReport,
  VendorDuplicateReport,
  VendorExposureReport,
  VendorRiskChildCandidate,
} from "../../domain/interfaces/i.riskLink";

const linksKey = (riskId: number) => ["riskLinks", riskId] as const;

/**
 * The API accepts one status at a time, so the "show dismissed" view is a
 * different query rather than a filter over one cached list. `status` is part of
 * the key for that reason.
 */
export function useRiskLinks(
  riskId: number,
  status?: RiskLinkStatus,
  /**
   * The scan and the hierarchy pass answer 202 the moment their jobs are
   * queued, so the invalidation that follows reads the state from before the
   * worker ran. The caller polls for the bounded window it is willing to wait.
   */
  refetchInterval: number | false = false,
) {
  return useQuery<RiskLink[]>({
    queryKey: [...linksKey(riskId), status ?? "default"],
    queryFn: () => getRiskLinks(riskId, status),
    enabled: Number.isFinite(riskId),
    refetchInterval,
  });
}

/**
 * A link decision is written to the history of the risk at each end, and the
 * other end may be a model or vendor risk, so every history view is marked
 * stale. Not awaited: only mounted views refetch, and the mutation should not
 * stay pending until they have.
 */
const refreshChangeHistory = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: ["changeHistory"] });
};

/** onSettled, not onSuccess: a 404 means the list on screen is stale too. */
function useInvalidateLinks(riskId: number) {
  const queryClient = useQueryClient();
  return () => {
    refreshChangeHistory(queryClient);
    return queryClient.invalidateQueries({ queryKey: linksKey(riskId) });
  };
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

/** Clearing a reviewed stale-inheritance warning is a link mutation, so the
 *  same list invalidation applies. */
export function useAcknowledgeParentLevelChange(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: (id: number) => acknowledgeParentLevelChange(id),
    onSettled: invalidate,
  });
}

export function useRecomputeRiskLinks(riskId: number) {
  const invalidate = useInvalidateLinks(riskId);
  return useMutation({
    mutationFn: () => recomputeRiskLinks(riskId),
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

const vendorLinksKey = (vendorRiskId: number) => ["vendorRiskLinks", vendorRiskId] as const;

/** Prefix of the three vendor risk insight reports, for one-call invalidation. */
export const VENDOR_INSIGHTS_KEY = ["vendorRiskInsights"] as const;

/**
 * The vendor risk's children. Same one-status-per-query rule as useRiskLinks,
 * and the same bounded polling after a hierarchy pass is queued.
 */
export function useVendorRiskLinks(
  vendorRiskId: number,
  status?: RiskLinkStatus,
  refetchInterval: number | false = false,
) {
  return useQuery<RiskLink[]>({
    queryKey: [...vendorLinksKey(vendorRiskId), status ?? "default"],
    queryFn: () => getVendorRiskLinks(vendorRiskId, status),
    enabled: Number.isFinite(vendorRiskId),
    refetchInterval,
  });
}

/**
 * A vendor-side change is also a change to the other end's list: the child's
 * own list for an inheritance link, the other vendor risk's for a related pair.
 * The panel does not know which of those are cached, so every risk and vendor
 * risk list is invalidated. Only mounted queries refetch.
 */
function useInvalidateVendorLinks() {
  const queryClient = useQueryClient();
  return () => {
    refreshChangeHistory(queryClient);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vendorRiskLinks"] }),
      queryClient.invalidateQueries({ queryKey: ["riskLinks"] }),
      // A child added or removed changes the vendor's reach.
      queryClient.invalidateQueries({ queryKey: VENDOR_INSIGHTS_KEY }),
    ]);
  };
}

export function useCreateVendorRiskLink() {
  const invalidate = useInvalidateVendorLinks();
  return useMutation({
    mutationFn: (input: CreateRiskLinkInput) => createRiskLink(input),
    onSettled: invalidate,
  });
}

export function useUpdateVendorRiskLinkStatus() {
  const invalidate = useInvalidateVendorLinks();
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

/** The org-wide related vendor risk scan, as useRecomputeRiskLinks is for risks. */
export function useRecomputeVendorRiskLinks() {
  const invalidate = useInvalidateVendorLinks();
  return useMutation({
    mutationFn: () => recomputeVendorRiskLinks(),
    onSettled: invalidate,
  });
}

/** Ranking data for the vendor panel's picker; outside the link keys, as above. */
export function useVendorRiskSharedProjects(vendorRiskId: number, enabled: boolean) {
  return useQuery<VendorRiskChildCandidate[]>({
    queryKey: ["vendorRiskLinkSharedProjects", vendorRiskId],
    queryFn: () => getVendorRiskSharedProjects(vendorRiskId),
    enabled: enabled && Number.isFinite(vendorRiskId),
  });
}

/** The vendor-scoped hierarchy pass. Settles into the same list invalidation. */
export function useSuggestVendorRiskHierarchy(vendorRiskId: number) {
  const invalidate = useInvalidateVendorLinks();
  return useMutation({
    mutationFn: () => suggestVendorRiskHierarchy(vendorRiskId),
    onSettled: invalidate,
  });
}

/** `enabled` lets the Vendors page skip the fetch while its Vendors tab is shown. */
export function useVendorExposure(enabled = true) {
  return useQuery<VendorExposureReport>({
    queryKey: [...VENDOR_INSIGHTS_KEY, "exposure"],
    queryFn: getVendorExposure,
    enabled,
  });
}

/** Mounted only inside an open insight section, so the scan waits until asked for. */
export function useVendorDuplicateCandidates() {
  return useQuery<VendorDuplicateReport>({
    queryKey: [...VENDOR_INSIGHTS_KEY, "duplicates"],
    queryFn: getVendorDuplicateCandidates,
  });
}

export function useVendorFrameworkCoverage() {
  return useQuery<VendorCoverageReport>({
    queryKey: [...VENDOR_INSIGHTS_KEY, "coverage"],
    queryFn: getVendorFrameworkCoverage,
  });
}
