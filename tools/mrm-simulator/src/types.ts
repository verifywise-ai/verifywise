// A single metric reading in the ingestion wire format.
export interface MetricPoint {
  metric: string;
  value: number;
  at: string; // ISO-8601
  window?: string;
  segment?: string;
  context?: Record<string, unknown>;
}

// Threshold to create for a model during setup.
export interface ThresholdSpec {
  metric: string;
  op: "gt" | "gte" | "lt" | "lte" | "outside";
  value_num?: number | null;
  value_lo?: number | null;
  value_hi?: number | null;
  severity: "warn" | "high" | "critical";
  breach_action: "notify" | "notify_flag_revalidation";
  segment?: string | null;
  window?: string | null;
}

// A model in the scenario fleet.
export interface FleetModel {
  externalKey: string;
  name: string;
  provider: string;
  tier: "1" | "2" | "3";
  materialityDrivers: string;
  metricKeys: string[]; // keys to register (e.g. psi, auc, gini, ks)
  thresholds: ThresholdSpec[];
}

// Per-point result the ingestion API returns.
export interface IngestResultPoint {
  metric: string;
  at: string;
  status: "ok" | "warn" | "breach" | "no_threshold" | "duplicate";
  pointId: number | null;
  threshold?: {
    op: string;
    value_num: number | null;
    value_lo: number | null;
    value_hi: number | null;
    severity: string;
  };
}

// A gap-finding.
export interface Finding {
  category: "contract" | "workflow" | "ux";
  severity: "high" | "medium" | "low";
  title: string;
  expected: string;
  actual: string;
  repro: string;
}

export interface SimConfig {
  baseUrl: string;
  email: string;
  password: string;
  allowRemote: boolean;
}
