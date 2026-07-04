// Deterministic, seeded metric storylines. Values are a function of
// (externalKey, metric, dayIndex, segment) with small reproducible noise so
// charts look organic without random run-to-run variation.

// Deterministic pseudo-noise in [-1, 1] from integer-ish inputs (no Math.random).
const noise = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// Linear ramp helper.
const ramp = (day: number, fromDay: number, toDay: number, fromVal: number, toVal: number): number => {
  if (day <= fromDay) return fromVal;
  if (day >= toDay) return toVal;
  const t = (day - fromDay) / (toDay - fromDay);
  return fromVal + t * (toVal - fromVal);
};

export const metricValue = (
  externalKey: string,
  metric: string,
  dayIndex: number,
  segment: string = "overall",
): number => {
  const n = noise(dayIndex + metric.length * 7 + externalKey.length * 13) * 0.01;

  if (externalKey === "credit-scoring-v3") {
    if (metric === "psi") return clamp(ramp(dayIndex, 0, 30, 0.05, 0.28) + n, 0, 1);
    if (metric === "auc") return clamp(ramp(dayIndex, 0, 30, 0.86, 0.82) + n, 0, 1);
    if (metric === "gini") return clamp(ramp(dayIndex, 0, 30, 0.7, 0.63) + n, 0, 1);
    if (metric === "ks") return clamp(0.4 + n, 0, 1);
  }

  if (externalKey === "fraud-detector-v2") {
    if (metric === "psi") return clamp(0.04 + n, 0, 1);
    if (metric === "auc") return clamp(0.94 + n, 0, 1);
    if (metric === "gini") return clamp(0.88 + n, 0, 1);
    if (metric === "ks") return clamp(0.6 + n, 0, 1);
  }

  if (externalKey === "loan-approval-v1") {
    if (metric === "gini") {
      if (segment === "subprime") return clamp(ramp(dayIndex, 0, 30, 0.6, 0.4) + n, 0, 1);
      return clamp(0.62 + n, 0, 1); // overall stays inside [0.45, 0.75]
    }
    if (metric === "psi") return clamp(0.06 + n, 0, 1);
    if (metric === "auc") return clamp(0.83 + n, 0, 1);
    if (metric === "ks") return clamp(0.45 + n, 0, 1);
  }

  if (externalKey === "churn-propensity-v1") {
    if (metric === "psi") {
      // healthy -> breach ~day 10 -> retrain recovery ~day 22
      const drift = ramp(dayIndex, 5, 12, 0.08, 0.2);
      const recover = ramp(dayIndex, 22, 26, 0.2, 0.08);
      const v = dayIndex < 22 ? drift : recover;
      return clamp(v + n, 0, 1);
    }
    if (metric === "auc") return clamp(0.8 + n, 0, 1);
    if (metric === "gini") return clamp(0.55 + n, 0, 1);
    if (metric === "ks") return clamp(0.38 + n, 0, 1);
  }

  // Unknown model/metric: benign flat value.
  return clamp(0.5 + n, 0, 1);
};
