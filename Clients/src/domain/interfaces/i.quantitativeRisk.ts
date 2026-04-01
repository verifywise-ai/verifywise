/**
 * Frontend interfaces for FAIR-inspired quantitative risk assessment.
 * Mirrors backend I.quantitativeRisk.ts interfaces.
 */

/** Three-point estimate used for PERT calculation */
export interface IThreePointEstimate {
  min: number;
  likely: number;
  max: number;
}

/** FAIR quantitative fields that extend a risk record */
export interface IQuantitativeRiskFields {
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

  total_loss_likely?: number | null;
  ale_estimate?: number | null;

  control_effectiveness?: number | null;
  residual_ale?: number | null;
  mitigation_cost_annual?: number | null;
  roi_percentage?: number | null;

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
  created_at?: string;
}

/** Portfolio aggregation result */
export interface IPortfolioSummary {
  total_ale: number;
  total_residual_ale: number;
  total_mitigation_cost: number;
  risk_count: number;
  risk_reduction: number;
  overall_roi: number | null;
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
  created_at?: string;
}

/** Benchmark filter options */
export interface IBenchmarkFilters {
  industries: string[];
  aiRiskTypes: string[];
}
