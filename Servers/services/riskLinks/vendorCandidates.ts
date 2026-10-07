import logger from "../../utils/logger/fileLogger";
import { getVendorRiskCandidatesQuery } from "../../utils/riskLink.utils";
import {
  getAnnouncedVendorRiskIdsQuery,
  hasVendorRiskCandidateNoticeQuery,
} from "../../utils/notification.utils";
import { notifyRiskOfVendorCandidates } from "../inAppNotification.service";

/**
 * Vendor counterpart of F6 (modelCandidates.ts): when a vendor gains a use
 * case, or a new vendor risk lands on a vendor that already has use cases, the
 * owners of project risks in those use cases hear once that a vendor risk could
 * be their parent. No `risk_links` row is written; the owner decides from the
 * Linked risks tab. Trigger-driven and fire-and-forget at every call site.
 */

/** Cap on risks notified per trigger, matching MAX_CANDIDATE_NOTICES. */
export const MAX_VENDOR_CANDIDATE_NOTICES = 25;

export interface VendorRiskCandidateNoticeSummary {
  organization_id: number;
  vendor_id: number;
  risks: number;
  candidates: number;
  notified: number;
}

export async function notifyVendorRiskCandidates(input: {
  organizationId: number;
  vendorId: number;
  vendorName: string;
  projectIds: number[];
  vendorRiskIds?: number[];
}): Promise<VendorRiskCandidateNoticeSummary> {
  const { organizationId, vendorId, vendorName, projectIds, vendorRiskIds } = input;
  const summary: VendorRiskCandidateNoticeSummary = {
    organization_id: organizationId,
    vendor_id: vendorId,
    risks: 0,
    candidates: 0,
    notified: 0,
  };
  if (projectIds.length === 0) return summary;

  const rows = await getVendorRiskCandidatesQuery({
    organizationId,
    vendorId,
    projectIds,
    vendorRiskIds,
    limit: MAX_VENDOR_CANDIDATE_NOTICES,
  });
  summary.risks = rows.length;

  const triggerVendorRiskIds =
    vendorRiskIds && vendorRiskIds.length > 0 ? [...vendorRiskIds].sort((a, b) => a - b) : null;

  for (const row of rows) {
    summary.candidates += row.candidate_count;
    if (row.risk_owner == null) continue;
    try {
      let announceIds: number[] = [];
      if (triggerVendorRiskIds) {
        const announced = await getAnnouncedVendorRiskIdsQuery(
          organizationId,
          row.risk_owner,
          row.risk_id,
          vendorId,
        );
        announceIds = triggerVendorRiskIds.filter((id) => !announced.includes(id));
        if (announceIds.length === 0) continue;
      } else if (
        await hasVendorRiskCandidateNoticeQuery(
          organizationId,
          row.risk_owner,
          row.risk_id,
          vendorId,
        )
      ) {
        continue;
      }
      const sent = await notifyRiskOfVendorCandidates(
        organizationId,
        { id: row.risk_id, risk_name: row.risk_name, risk_owner: row.risk_owner },
        { id: vendorId, name: vendorName },
        row.candidate_count,
        announceIds,
      );
      if (sent) summary.notified += 1;
    } catch (error) {
      logger.error(
        `❌ Vendor-risk-candidate notification failed for org ${organizationId} risk ${row.risk_id}:`,
        error,
      );
    }
  }

  return summary;
}
