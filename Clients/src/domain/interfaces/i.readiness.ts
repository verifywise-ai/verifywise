export type ReadinessLevel = "ready" | "needs_work" | "at_risk" | "not_started";

export interface ControlReadinessScore {
  id: number;
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
  calculated_at: string;
}

export interface WeakestControl {
  control_id: number;
  overall_score: number;
  readiness_level: ReadinessLevel;
}

export interface FrameworkReadinessScore {
  id: number;
  framework_type: string;
  project_id: number | null;
  total_controls: number | null;
  avg_score: number | null;
  ready_count: number | null;
  needs_work_count: number | null;
  at_risk_count: number | null;
  not_started_count: number | null;
  weakest_controls: WeakestControl[] | null;
  calculated_at: string;
}
