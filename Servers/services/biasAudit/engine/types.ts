import type { DegenerateMedian } from "./scoringRate";

export type MetricMode = "selection_rate" | "scoring_rate" | "fairness_metrics";

export interface GroupResult {
  categoryType: string;
  categoryName: string;
  applicantCount: number;
  selectedCount: number;
  selectionRate: number;
  impactRatio: number | null;
  excluded: boolean;
  flagged: boolean;
}

export interface CategoryTable {
  title: string;
  categoryKey: string;
  rows: GroupResult[];
  highestGroup: string | null;
  highestRate: number | null;
}

export type AuditRecord = Record<string, unknown>;

export interface ScoreDistributionBin {
  lower: number;
  upper: number;
  count: number;
}

export interface ScoreDistributionGroup {
  categoryType: string;
  categoryName: string;
  count: number;
  mean: number;
  median: number;
  /** Population standard deviation, matching Python's pstdev. */
  std: number;
  bins: ScoreDistributionBin[];
  ksStatistic: number | null;
  ksPvalue: number | null;
}

export interface ScoreDistributionTable {
  title: string;
  categoryKey: string;
  groups: ScoreDistributionGroup[];
  overallMean: number | null;
  overallMedian: number | null;
}

export interface ConfusionMatrixGroupResult {
  categoryType: string;
  categoryName: string;
  count: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  truePositiveRate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  trueNegativeRate: number;
  precision: number;
  accuracy: number;
  excluded: boolean;
}

export interface FairnessMetricsTable {
  title: string;
  categoryKey: string;
  groups: ConfusionMatrixGroupResult[];
  equalOpportunityDifference: number | null;
  equalizedOddsDifference: number | null;
  predictiveParityDifference: number | null;
  tprMaxGroup: string | null;
  tprMinGroup: string | null;
  fprMaxGroup: string | null;
  fprMinGroup: string | null;
}

export interface CategoryConfig {
  label: string;
  groups: string[];
}

export interface IntersectionalConfig {
  required: boolean;
  cross: string[];
}

/**
 * The computation's configuration.
 *
 * Only the fields the computation reads are ported. The Python's
 * presentation-only fields (`mode`, `preset_name`, `metrics`,
 * `required_metadata`, `metadata`, `results_format` and the audit-metadata
 * block) are deliberately omitted.
 */
export interface BiasAuditConfig {
  presetId: string;
  metric: MetricMode;
  categories: Record<string, CategoryConfig>;
  intersectional: IntersectionalConfig;
  threshold: number | null;
  smallSampleExclusion: number | null;
  outcomeColumn: string;
  scoreColumn: string | null;
  predictionColumn: string | null;
  groundTruthColumn: string | null;
  columnMapping?: Record<string, string>;
}

export interface BiasAuditResult {
  metric: MetricMode;
  tables: CategoryTable[];
  scoreDistributionTables: ScoreDistributionTable[];
  fairnessMetricsTables: FairnessMetricsTable[];
  overallSelectionRate: number;
  /**
   * The sample median in scoring mode. Has no counterpart in the Python's
   * result, which computes it internally and discards it; the stance needs
   * it to state what the rate was measured against.
   */
  overallMedian: number | null;
  totalApplicants: number;
  totalSelected: number;
  unknownCount: number;
  flagsCount: number;
  excludedCount: number;
  summary: string;
  diagnostics: { degenerateMedian: DegenerateMedian | null };
}
