import { getModelRiskCandidatesQuery } from "../../utils/riskLink.utils";
import { notifyRiskOfModelCandidates } from "../inAppNotification.service";
import logger from "../../utils/logger/fileLogger";

/**
 * F6 — Model metadata → model risk candidate notices.
 *
 * When a model inventory gains a project, or a new model risk is created on a
 * model that already has projects, the project risks in those projects that
 * have model-risk link candidates they have never seen get one in-app
 * notification each, pointing at the risk (where LinkedRisksPanel lives).
 *
 * No `risk_links` rows are written — cross-entity `related_to` is forbidden by
 * a DB CHECK, `inherits_from` collides with the single-parent index, and the
 * scoring engine cannot discriminate these pairs (see the F6 design doc §2).
 * Like the F5 sweep this detects a transition and notifies once; unlike F5 it
 * is trigger-driven, not scheduled, so there is no clear path and no
 * re-notification guard beyond the NOT EXISTS in the query.
 */

/** Cap on risks notified per trigger — matches MAX_CROSS_ENTITY_CANDIDATES. */
export const MAX_CANDIDATE_NOTICES = 25;

export interface ModelRiskCandidateNoticeSummary {
  organization_id: number;
  model_inventory_id: number;
  risks: number; // rows the query returned
  candidates: number; // sum of candidate_count
  notified: number; // notifications actually sent
}

const zeroSummary = (
  organizationId: number,
  modelInventoryId: number,
): ModelRiskCandidateNoticeSummary => ({
  organization_id: organizationId,
  model_inventory_id: modelInventoryId,
  risks: 0,
  candidates: 0,
  notified: 0,
});

export async function notifyModelRiskCandidates(input: {
  organizationId: number;
  modelInventoryId: number;
  modelName: string;
  projectIds: number[];
  modelRiskIds?: number[];
}): Promise<ModelRiskCandidateNoticeSummary> {
  const { organizationId, modelInventoryId, modelName, projectIds, modelRiskIds } = input;

  // Never reach the database with an empty project list (IN () is a syntax
  // error); a brand-new model with no projects simply has no candidates.
  if (projectIds.length === 0) return zeroSummary(organizationId, modelInventoryId);

  const rows = await getModelRiskCandidatesQuery({
    organizationId,
    modelInventoryId,
    projectIds,
    modelRiskIds,
    limit: MAX_CANDIDATE_NOTICES,
  });

  let candidates = 0;
  let notified = 0;
  for (const row of rows) {
    candidates += row.candidate_count;
    if (row.risk_owner == null) continue;
    try {
      await notifyRiskOfModelCandidates(
        organizationId,
        { id: row.risk_id, risk_name: row.risk_name, risk_owner: row.risk_owner },
        { id: modelInventoryId, name: modelName },
        row.candidate_count,
      );
      notified += 1;
    } catch (error) {
      logger.error(
        `❌ Model-risk-candidate notification failed for org ${organizationId} risk ${row.risk_id}:`,
        error,
      );
    }
  }

  return {
    organization_id: organizationId,
    model_inventory_id: modelInventoryId,
    risks: rows.length,
    candidates,
    notified,
  };
}
