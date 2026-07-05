import { ThresholdSpec } from "../types.js";

export interface RunStarted {
  type: "run_started";
  target: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  models: {
    externalKey: string;
    name: string;
    tier: string;
    metrics: string[];
    thresholds: ThresholdSpec[];
  }[];
}

export interface Metric {
  type: "metric";
  externalKey: string;
  period: string; // YYYY-MM-DD
  metric: string;
  value: number;
  segment: string;
  status: "ok" | "warn" | "breach" | "no_threshold";
  threshold: ThresholdSpec | null;
}

export interface Breach {
  type: "breach";
  externalKey: string;
  period: string;
  metric: string;
  value: number;
  severity: string;
  flagged: boolean; // true when breach_action is notify_flag_revalidation
}

export interface Push {
  type: "push";
  externalKey: string;
  period: string;
  accepted: number;
  results: { metric: string; status: string }[];
}

export interface RunDone {
  type: "run_done";
  totals: { computed: number; pushed: number; accepted: number; breaches: number };
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type DashboardEvent = RunStarted | Metric | Breach | Push | RunDone | ErrorEvent;
