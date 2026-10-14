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
