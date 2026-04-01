/**
 * Interfaces for FAIR-inspired quantitative risk assessment.
 *
 * These extend the existing qualitative risk model with monetary
 * estimates for event frequency and loss magnitude.
 */

/** Three-point estimate used for PERT calculation */
export interface IThreePointEstimate {
  min: number;
  likely: number;
  max: number;
}

/** FAIR quantitative fields that extend a risk record */
export interface IQuantitativeRiskFields {
  // Event Frequency (annualized)
  event_frequency_min?: number | null;
  event_frequency_likely?: number | null;
  event_frequency_max?: number | null;

  // Loss Magnitude: Regulatory Fines
  loss_regulatory_min?: number | null;
  loss_regulatory_likely?: number | null;
  loss_regulatory_max?: number | null;

  // Loss Magnitude: Operational Costs
  loss_operational_min?: number | null;
  loss_operational_likely?: number | null;
  loss_operational_max?: number | null;

  // Loss Magnitude: Litigation Costs
  loss_litigation_min?: number | null;
  loss_litigation_likely?: number | null;
  loss_litigation_max?: number | null;

  // Loss Magnitude: Reputational Damage
  loss_reputational_min?: number | null;
  loss_reputational_likely?: number | null;
  loss_reputational_max?: number | null;

  // Computed fields
  total_loss_likely?: number | null;
  ale_estimate?: number | null;

  // Mitigation quantitative
  control_effectiveness?: number | null;
  residual_ale?: number | null;
  mitigation_cost_annual?: number | null;
  roi_percentage?: number | null;

  // Reference
  benchmark_id?: number | null;
  currency?: string | null;
}

/** Industry benchmark record */
export interface IRiskBenchmark {
  id?: number;
  category: string;
  industry: string;
  ai_risk_type: string;
  regulation?: string | null;

  event_frequency_min?: number | null;
  event_frequency_likely?: number | null;
  event_frequency_max?: number | null;

  loss_regulatory_min?: number | null;
  loss_regulatory_likely?: number | null;
  loss_regulatory_max?: number | null;

  loss_operational_min?: number | null;
  loss_operational_likely?: number | null;
  loss_operational_max?: number | null;

  loss_litigation_min?: number | null;
  loss_litigation_likely?: number | null;
  loss_litigation_max?: number | null;

  loss_reputational_min?: number | null;
  loss_reputational_likely?: number | null;
  loss_reputational_max?: number | null;

  source?: string | null;
  notes?: string | null;
  created_at?: Date;
}

/** Portfolio aggregation result */
export interface IPortfolioSummary {
  total_ale: number;
  total_residual_ale: number;
  total_mitigation_cost: number;
  risk_count: number;
  risk_reduction: number; // total_ale - total_residual_ale
  overall_roi: number | null; // (risk_reduction - total_mitigation_cost) / total_mitigation_cost * 100
  loss_regulatory: number;
  loss_operational: number;
  loss_litigation: number;
  loss_reputational: number;
}

/** Portfolio snapshot for trend tracking */
export interface IPortfolioSnapshot {
  id?: number;
  organization_id: number;
  project_id?: number | null;
  total_ale: number;
  total_residual_ale: number;
  total_mitigation_cost: number;
  risk_count: number;
  snapshot_date: string;
  created_at?: Date;
}
