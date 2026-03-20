import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  IQuantitativeRiskFields,
  IPortfolioSummary,
  IPortfolioSnapshot,
} from "../domain.layer/interfaces/I.quantitativeRisk";

// ============================================================
// FAIR Computation Functions
// ============================================================

/**
 * PERT (Program Evaluation and Review Technique) estimate.
 * Produces a weighted average that favors the most likely value.
 *
 * Formula: (min + 4 * likely + max) / 6
 */
export function pertEstimate(
  min: number,
  likely: number,
  max: number
): number {
  return (min + 4 * likely + max) / 6;
}

/**
 * Compute total loss magnitude by summing across all 4 categories.
 * Returns three-point estimate (min, likely, max).
 */
export function computeTotalLoss(fields: IQuantitativeRiskFields): {
  min: number;
  likely: number;
  max: number;
} {
  return {
    min:
      (Number(fields.loss_regulatory_min) || 0) +
      (Number(fields.loss_operational_min) || 0) +
      (Number(fields.loss_litigation_min) || 0) +
      (Number(fields.loss_reputational_min) || 0),
    likely:
      (Number(fields.loss_regulatory_likely) || 0) +
      (Number(fields.loss_operational_likely) || 0) +
      (Number(fields.loss_litigation_likely) || 0) +
      (Number(fields.loss_reputational_likely) || 0),
    max:
      (Number(fields.loss_regulatory_max) || 0) +
      (Number(fields.loss_operational_max) || 0) +
      (Number(fields.loss_litigation_max) || 0) +
      (Number(fields.loss_reputational_max) || 0),
  };
}

/**
 * Compute Annualized Loss Expectation (ALE).
 *
 * ALE = PERT(event_frequency) × PERT(total_loss)
 *
 * Returns null if frequency fields are not populated.
 */
export function computeALE(fields: IQuantitativeRiskFields): number | null {
  if (
    fields.event_frequency_min == null ||
    fields.event_frequency_likely == null ||
    fields.event_frequency_max == null
  ) {
    return null;
  }

  const freqEstimate = pertEstimate(
    Number(fields.event_frequency_min),
    Number(fields.event_frequency_likely),
    Number(fields.event_frequency_max)
  );

  const totalLoss = computeTotalLoss(fields);
  const lossEstimate = pertEstimate(totalLoss.min, totalLoss.likely, totalLoss.max);

  return Math.round(freqEstimate * lossEstimate * 100) / 100;
}

/**
 * Compute residual ALE after controls.
 *
 * Residual ALE = ALE × (1 - control_effectiveness / 100)
 */
export function computeResidualALE(
  ale: number,
  controlEffectiveness: number | null | undefined
): number {
  const effectiveness = Number(controlEffectiveness) || 0;
  const clamped = Math.max(0, Math.min(100, effectiveness));
  return Math.round(ale * (1 - clamped / 100) * 100) / 100;
}

/**
 * Compute ROI of mitigation investment.
 *
 * ROI = ((ALE - Residual ALE) - Mitigation Cost) / Mitigation Cost × 100
 *
 * Returns null if mitigation cost is zero or not provided.
 */
export function computeROI(
  ale: number,
  residualAle: number,
  mitigationCost: number | null | undefined
): number | null {
  const cost = Number(mitigationCost) || 0;
  if (cost <= 0) return null;

  const riskReduction = ale - residualAle;
  return Math.round(((riskReduction - cost) / cost) * 10000) / 100;
}

/**
 * Compute all derived FAIR fields from input fields.
 * Used by the risk controller on create/update to auto-populate
 * stored computed columns.
 */
export function computeDerivedFields(
  fields: IQuantitativeRiskFields
): Partial<IQuantitativeRiskFields> {
  const totalLoss = computeTotalLoss(fields);
  const ale = computeALE(fields);

  if (ale == null) {
    return {
      total_loss_likely: totalLoss.likely || null,
      ale_estimate: null,
      residual_ale: null,
      roi_percentage: null,
    };
  }

  const residualAle = computeResidualALE(ale, fields.control_effectiveness);
  const roi = computeROI(ale, residualAle, fields.mitigation_cost_annual);

  return {
    total_loss_likely: totalLoss.likely,
    ale_estimate: ale,
    residual_ale: residualAle,
    roi_percentage: roi,
  };
}

// ============================================================
// Portfolio Aggregation Queries
// ============================================================

/**
 * Get portfolio summary for an organization (all risks with ALE).
 */
export async function getPortfolioByOrg(
  organizationId: number
): Promise<IPortfolioSummary> {
  const [result] = await sequelize.query<{
    total_ale: string;
    total_residual_ale: string;
    total_mitigation_cost: string;
    risk_count: string;
    loss_regulatory: string;
    loss_operational: string;
    loss_litigation: string;
    loss_reputational: string;
  }>(
    `SELECT
      COALESCE(SUM(ale_estimate), 0) AS total_ale,
      COALESCE(SUM(residual_ale), 0) AS total_residual_ale,
      COALESCE(SUM(mitigation_cost_annual), 0) AS total_mitigation_cost,
      COUNT(*) AS risk_count,
      COALESCE(SUM(loss_regulatory_likely), 0) AS loss_regulatory,
      COALESCE(SUM(loss_operational_likely), 0) AS loss_operational,
      COALESCE(SUM(loss_litigation_likely), 0) AS loss_litigation,
      COALESCE(SUM(loss_reputational_likely), 0) AS loss_reputational
    FROM risks
    WHERE organization_id = :organizationId
      AND is_deleted = false
      AND ale_estimate IS NOT NULL`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );

  const totalAle = Number(result?.total_ale) || 0;
  const totalResidualAle = Number(result?.total_residual_ale) || 0;
  const totalMitigationCost = Number(result?.total_mitigation_cost) || 0;
  const riskReduction = totalAle - totalResidualAle;

  return {
    total_ale: totalAle,
    total_residual_ale: totalResidualAle,
    total_mitigation_cost: totalMitigationCost,
    risk_count: Number(result?.risk_count) || 0,
    risk_reduction: riskReduction,
    overall_roi:
      totalMitigationCost > 0
        ? Math.round(
            ((riskReduction - totalMitigationCost) / totalMitigationCost) *
              10000
          ) / 100
        : null,
    loss_regulatory: Number(result?.loss_regulatory) || 0,
    loss_operational: Number(result?.loss_operational) || 0,
    loss_litigation: Number(result?.loss_litigation) || 0,
    loss_reputational: Number(result?.loss_reputational) || 0,
  };
}

/**
 * Get portfolio summary for a specific project.
 */
export async function getPortfolioByProject(
  organizationId: number,
  projectId: number
): Promise<IPortfolioSummary> {
  const [result] = await sequelize.query<{
    total_ale: string;
    total_residual_ale: string;
    total_mitigation_cost: string;
    risk_count: string;
    loss_regulatory: string;
    loss_operational: string;
    loss_litigation: string;
    loss_reputational: string;
  }>(
    `SELECT
      COALESCE(SUM(r.ale_estimate), 0) AS total_ale,
      COALESCE(SUM(r.residual_ale), 0) AS total_residual_ale,
      COALESCE(SUM(r.mitigation_cost_annual), 0) AS total_mitigation_cost,
      COUNT(*) AS risk_count,
      COALESCE(SUM(r.loss_regulatory_likely), 0) AS loss_regulatory,
      COALESCE(SUM(r.loss_operational_likely), 0) AS loss_operational,
      COALESCE(SUM(r.loss_litigation_likely), 0) AS loss_litigation,
      COALESCE(SUM(r.loss_reputational_likely), 0) AS loss_reputational
    FROM risks r
    JOIN projects_risks pr ON r.id = pr.risk_id
    WHERE r.organization_id = :organizationId
      AND pr.project_id = :projectId
      AND r.is_deleted = false
      AND r.ale_estimate IS NOT NULL`,
    {
      replacements: { organizationId, projectId },
      type: QueryTypes.SELECT,
    }
  );

  const totalAle = Number(result?.total_ale) || 0;
  const totalResidualAle = Number(result?.total_residual_ale) || 0;
  const totalMitigationCost = Number(result?.total_mitigation_cost) || 0;
  const riskReduction = totalAle - totalResidualAle;

  return {
    total_ale: totalAle,
    total_residual_ale: totalResidualAle,
    total_mitigation_cost: totalMitigationCost,
    risk_count: Number(result?.risk_count) || 0,
    risk_reduction: riskReduction,
    overall_roi:
      totalMitigationCost > 0
        ? Math.round(
            ((riskReduction - totalMitigationCost) / totalMitigationCost) *
              10000
          ) / 100
        : null,
    loss_regulatory: Number(result?.loss_regulatory) || 0,
    loss_operational: Number(result?.loss_operational) || 0,
    loss_litigation: Number(result?.loss_litigation) || 0,
    loss_reputational: Number(result?.loss_reputational) || 0,
  };
}

/**
 * Record a portfolio snapshot for trend tracking.
 * Called after quantitative risk create/update.
 */
export async function recordPortfolioSnapshot(
  organizationId: number,
  projectId?: number | null
): Promise<void> {
  const summary = projectId
    ? await getPortfolioByProject(organizationId, projectId)
    : await getPortfolioByOrg(organizationId);

  // Only record if there are risks with ALE
  if (summary.risk_count === 0) return;

  const today = new Date().toISOString().split("T")[0];

  // Upsert: replace today's snapshot if it already exists
  await sequelize.query(
    `INSERT INTO risk_portfolio_snapshots
      (organization_id, project_id, total_ale, total_residual_ale,
       total_mitigation_cost, risk_count, snapshot_date, created_at)
    VALUES
      (:organizationId, :projectId, :totalAle, :totalResidualAle,
       :totalMitigationCost, :riskCount, :snapshotDate, NOW())
    ON CONFLICT (organization_id, snapshot_date)
      WHERE project_id IS NOT DISTINCT FROM :projectId
    DO UPDATE SET
      total_ale = EXCLUDED.total_ale,
      total_residual_ale = EXCLUDED.total_residual_ale,
      total_mitigation_cost = EXCLUDED.total_mitigation_cost,
      risk_count = EXCLUDED.risk_count,
      created_at = NOW()`,
    {
      replacements: {
        organizationId,
        projectId: projectId ?? null,
        totalAle: summary.total_ale,
        totalResidualAle: summary.total_residual_ale,
        totalMitigationCost: summary.total_mitigation_cost,
        riskCount: summary.risk_count,
        snapshotDate: today,
      },
      type: QueryTypes.INSERT,
    }
  );
}

/**
 * Get portfolio trend snapshots for a time period.
 */
export async function getPortfolioTrend(
  organizationId: number,
  days: number = 30,
  projectId?: number | null
): Promise<IPortfolioSnapshot[]> {
  const projectFilter = projectId
    ? "AND project_id = :projectId"
    : "AND project_id IS NULL";

  const snapshots = await sequelize.query<IPortfolioSnapshot>(
    `SELECT
      id, organization_id, project_id,
      total_ale, total_residual_ale, total_mitigation_cost,
      risk_count, snapshot_date, created_at
    FROM risk_portfolio_snapshots
    WHERE organization_id = :organizationId
      ${projectFilter}
      AND snapshot_date >= CURRENT_DATE - :days
    ORDER BY snapshot_date ASC`,
    {
      replacements: { organizationId, projectId: projectId ?? null, days },
      type: QueryTypes.SELECT,
    }
  );

  return snapshots;
}
