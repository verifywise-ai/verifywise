export type ReadinessLevel = "ready" | "needs_work" | "at_risk" | "not_started";

export interface IControlReadinessScore {
  id?: number;
  control_id: number;
  framework_type: string;
  project_id: number | null;
  evidence_quality_score: number | null;
  evidence_count_score: number | null;
  evidence_recency_score: number | null;
  task_completion_score: number | null;
  risk_mitigation_score: number | null;
  overall_score: number;
  readiness_level: ReadinessLevel;
  recommendations: string[] | null;
  calculated_at: Date;
  organization_id: number;
}

export interface IWeakestControl {
  control_id: number;
  overall_score: number;
  readiness_level: ReadinessLevel;
}

export interface IFrameworkReadinessScore {
  id?: number;
  framework_type: string;
  project_id: number | null;
  total_controls: number | null;
  avg_score: number | null;
  ready_count: number | null;
  needs_work_count: number | null;
  at_risk_count: number | null;
  not_started_count: number | null;
  weakest_controls: IWeakestControl[] | null;
  calculated_at: Date;
  organization_id: number;
}
