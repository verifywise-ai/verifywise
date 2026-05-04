export const RISK_LABELS = {
  low: {
    text: "Low risk",
    color: "#2E7D32", // darker green
  },
  medium: {
    text: "Medium risk",
    color: "#8D6E63", // darker brown (instead of washed yellow)
  },
  high: {
    text: "High risk",
    color: "#E65100", // deep orange
  },
  critical: {
    text: "Very high risk",
    color: "#B71C1C", // stronger red
  },
  noRisk: {
    text: "Very Low risk",
    color: "#33691E", // deep green
  },
  negligible: {
    text: "Negligible",
    color: "#33691E",
  },
  minor: {
    text: "Minor",
    color: "#2E7D32",
  },
  moderate: {
    text: "Moderate",
    color: "#8D6E63",
  },
  major: {
    text: "Major",
    color: "#E65100",
  },
  catastrophic: {
    text: "Catastrophic",
    color: "#B71C1C",
  },
  overdue: {
    text: "Overdue",
    color: "#B71C1C", // use same color as critical/catastrophic
  },
};

export enum Likelihood {
  Rare = 1,
  Unlikely = 2,
  Possible = 3,
  Likely = 4,
  AlmostCertain = 5,
}

export enum Severity {
  Negligible = 1,
  Minor = 2,
  Moderate = 3,
  Major = 4,
  Catastrophic = 5,
}
