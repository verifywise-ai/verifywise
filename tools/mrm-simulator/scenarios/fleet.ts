import { FleetModel } from "../src/types.js";

export const FLEET: FleetModel[] = [
  {
    externalKey: "credit-scoring-v3",
    name: "Credit scoring v3",
    provider: "in-house",
    tier: "1",
    materialityDrivers: "capital impact, regulatory reporting, customer exposure",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      { metric: "psi", op: "gt", value_num: 0.2, severity: "high", breach_action: "notify_flag_revalidation" },
      { metric: "auc", op: "lt", value_num: 0.8, severity: "warn", breach_action: "notify" },
    ],
  },
  {
    externalKey: "fraud-detector-v2",
    name: "Fraud detector v2",
    provider: "in-house",
    tier: "1",
    materialityDrivers: "fraud loss exposure, real-time decisioning",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      { metric: "psi", op: "gt", value_num: 0.25, severity: "high", breach_action: "notify" },
    ],
  },
  {
    externalKey: "loan-approval-v1",
    name: "Loan approval v1",
    provider: "in-house",
    tier: "2",
    materialityDrivers: "lending decisions, fair-lending risk",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      {
        metric: "gini",
        op: "outside",
        value_lo: 0.45,
        value_hi: 0.75,
        severity: "high",
        breach_action: "notify_flag_revalidation",
        segment: "subprime",
      },
    ],
  },
  {
    externalKey: "churn-propensity-v1",
    name: "Churn propensity v1",
    provider: "in-house",
    tier: "3",
    materialityDrivers: "retention spend allocation",
    metricKeys: ["psi", "auc", "gini", "ks"],
    thresholds: [
      { metric: "psi", op: "gt", value_num: 0.15, severity: "warn", breach_action: "notify" },
    ],
  },
];
