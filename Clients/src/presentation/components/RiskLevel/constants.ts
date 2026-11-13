import { palette } from "../../themes/palette";
export const RISK_LABELS = {
  low: {
    text: "Low risk",
    color: palette.status.success.text, // darker green
  },
  medium: {
    text: "Medium risk",
    color: palette.risk.medium.text,
  },
  high: {
    text: "High risk",
    color: palette.risk.high.text,
  },
  critical: {
    text: "Very high risk",
    color: palette.risk.critical.text,
  },
  noRisk: {
    text: "Very Low risk",
    color: palette.risk.veryLow.text,
  },
  negligible: {
    text: "Negligible",
    color: palette.risk.veryLow.text,
  },
  minor: {
    text: "Minor",
    color: palette.status.success.text,
  },
  moderate: {
    text: "Moderate",
    color: palette.risk.medium.text,
  },
  major: {
    text: "Major",
    color: palette.risk.high.text,
  },
  catastrophic: {
    text: "Catastrophic",
    color: palette.risk.critical.text,
  },
  overdue: {
    text: "Overdue",
    color: palette.risk.critical.text,
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
