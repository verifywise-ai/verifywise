import CustomAxios from "./customAxios";

// ==================== TYPES ====================

export interface BiasAuditPresetSummary {
  id: string;
  name: string;
  jurisdiction: string;
  effective_date: string;
  mode: string;
  description: string;
}

export interface CategoryConfig {
  label: string;
  groups: string[];
}

export interface IntersectionalConfig {
  required: boolean;
  cross: string[];
}

export interface ResultsTableConfig {
  type: string;
  category_key?: string;
  title: string;
}

export interface BiasAuditPreset {
  id: string;
  name: string;
  jurisdiction: string;
  effective_date: string;
  mode: string;
  description: string;
  categories: Record<string, CategoryConfig>;
  intersectional?: IntersectionalConfig;
  metrics: string[];
  threshold: number | null;
  small_sample_exclusion: number | null;
  required_metadata: string[];
  results_format?: {
    tables: ResultsTableConfig[];
  };
  checklist_items?: string[];
  recommended_threshold?: number | null;
  sections?: string[];
}

export interface BiasAuditSummary {
  id: string;
  orgId: string;
  projectId: string | null;
  presetId: string;
  presetName: string;
  mode: string;
  status: "pending" | "running" | "completed" | "failed";
  config: Record<string, any>;
  results: BiasAuditResultFull | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string | null;
  modelInventoryId?: number | null;
}

export interface GroupResultRow {
  id: number;
  auditId: string;
  categoryType: string;
  categoryName: string;
  applicantCount: number;
  selectedCount: number;
  selectionRate: number;
  impactRatio: number | null;
  excluded: boolean;
  flagged: boolean;
  createdAt: string;
}

export interface CategoryTableResult {
  title: string;
  category_key: string;
  rows: {
    category_type: string;
    category_name: string;
    applicant_count: number;
    selected_count: number;
    selection_rate: number;
    impact_ratio: number | null;
    excluded: boolean;
    flagged: boolean;
  }[];
  highest_group: string | null;
  highest_rate: number | null;
}

export type BiasAuditMetric = "selection_rate" | "scoring_rate" | "fairness_metrics";

export interface ScoreDistributionBin {
  lower: number;
  upper: number;
  count: number;
}

export interface ScoreDistributionGroup {
  category_type: string;
  category_name: string;
  count: number;
  mean: number;
  median: number;
  std: number;
  bins: ScoreDistributionBin[];
  ks_statistic: number | null;
  ks_pvalue: number | null;
}

export interface ScoreDistributionTable {
  title: string;
  category_key: string;
  groups: ScoreDistributionGroup[];
  overall_mean: number;
  overall_median: number;
}

export interface ConfusionMatrixGroupResult {
  category_type: string;
  category_name: string;
  count: number;
  true_positive: number;
  false_positive: number;
  true_negative: number;
  false_negative: number;
  true_positive_rate: number;
  false_positive_rate: number;
  false_negative_rate: number;
  true_negative_rate: number;
  precision: number;
  accuracy: number;
  excluded: boolean;
}

export interface FairnessMetricsTable {
  title: string;
  category_key: string;
  groups: ConfusionMatrixGroupResult[];
  equal_opportunity_difference: number | null;
  equalized_odds_difference: number | null;
  predictive_parity_difference: number | null;
  tpr_max_group: string | null;
  tpr_min_group: string | null;
  fpr_max_group: string | null;
  fpr_min_group: string | null;
}

export interface BiasAuditResultFull {
  metric?: BiasAuditMetric;
  tables: CategoryTableResult[];
  score_distribution_tables?: ScoreDistributionTable[];
  fairness_metrics_tables?: FairnessMetricsTable[];
  overall_selection_rate: number;
  total_applicants: number;
  total_selected: number;
  unknown_count: number;
  flags_count: number;
  excluded_count: number;
  summary: string;
}

export interface BiasAuditDetailResponse {
  auditId: string;
  status: string;
  presetId: string;
  presetName: string;
  mode: string;
  config: Record<string, any>;
  results: BiasAuditResultFull;
  resultRows: GroupResultRow[];
  createdAt: string;
  completedAt: string;
  createdBy: string | null;
}

export interface CreateBiasAuditConfig {
  presetId: string;
  presetName?: string;
  mode?: string;
  metric?: BiasAuditMetric;
  orgId: string;
  projectId?: string;
  categories?: Record<string, CategoryConfig>;
  intersectional?: IntersectionalConfig;
  metrics?: string[];
  threshold?: number | null;
  smallSampleExclusion?: number | null;
  outcomeColumn: string;
  scoreColumn?: string;
  predictionColumn?: string;
  groundTruthColumn?: string;
  columnMapping: Record<string, string>;
  metadata?: Record<string, string>;
  // Audit metadata for the formal PDF report
  systemName?: string;
  systemVersion?: string;
  systemDescription?: string;
  auditorName?: string;
  auditorRole?: string;
  auditorIndependence?: "self" | "internal" | "third_party";
  deploymentContext?: string;
  dataSource?: string;
  dataDateRangeStart?: string;
  dataDateRangeEnd?: string;
  modelInventoryId?: number;
}

// ==================== SERVICE ====================

class BiasAuditService {
  // Presets
  async listPresets(): Promise<BiasAuditPresetSummary[]> {
    const res = await CustomAxios.get("/deepeval/bias-audits/presets");
    return (res.data as { presets: BiasAuditPresetSummary[] }).presets;
  }

  async getPreset(presetId: string): Promise<BiasAuditPreset> {
    const res = await CustomAxios.get(`/deepeval/bias-audits/presets/${presetId}`);
    return (res.data as { preset: BiasAuditPreset }).preset;
  }

  // Audits
  async runAudit(
    dataset: File,
    config: CreateBiasAuditConfig,
  ): Promise<{ auditId: string; status: string }> {
    const formData = new FormData();
    formData.append("dataset", dataset);
    formData.append("config_json", JSON.stringify(config));
    formData.append("org_id", config.orgId);

    const res = await CustomAxios.post("/deepeval/bias-audits/run", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data as { auditId: string; status: string };
  }

  async getStatus(auditId: string): Promise<{ auditId: string; status: string; error?: string }> {
    const res = await CustomAxios.get(`/deepeval/bias-audits/${auditId}/status`);
    return res.data as { auditId: string; status: string; error?: string };
  }

  async getResults(auditId: string): Promise<BiasAuditDetailResponse> {
    const res = await CustomAxios.get(`/deepeval/bias-audits/${auditId}/results`);
    return res.data as BiasAuditDetailResponse;
  }

  async listAudits(params?: { org_id?: string; project_id?: string }): Promise<BiasAuditSummary[]> {
    const res = await CustomAxios.get("/deepeval/bias-audits", { params });
    return (res.data as { audits: BiasAuditSummary[] }).audits;
  }

  async deleteAudit(auditId: string): Promise<{ message: string; auditId: string }> {
    const res = await CustomAxios.delete(`/deepeval/bias-audits/${auditId}`);
    return res.data as { message: string; auditId: string };
  }

  async updateAuditName(
    auditId: string,
    systemName: string,
  ): Promise<{ auditId: string; systemName: string }> {
    const res = await CustomAxios.patch(`/deepeval/bias-audits/${auditId}`, { systemName });
    return res.data as { auditId: string; systemName: string };
  }

  async downloadReport(auditId: string): Promise<Blob> {
    const res = await CustomAxios.get(`/deepeval/bias-audits/${auditId}/report.pdf`, {
      responseType: "blob",
    });
    return res.data as Blob;
  }

  async parseHeaders(dataset: File): Promise<string[]> {
    const formData = new FormData();
    formData.append("dataset", dataset);
    const res = await CustomAxios.post("/deepeval/bias-audits/parse-headers", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return (res.data as { headers: string[] }).headers;
  }
}

export const biasAuditService = new BiasAuditService();
