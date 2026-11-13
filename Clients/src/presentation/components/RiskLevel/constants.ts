import { palette } from "../../themes/palette";
import { chartTheme } from "../../themes/chartTheme";
export const RISK_LABELS = {
  low: {
    text: "Low risk",
    color: palette.status.success.text, // darker green
  },
  medium: {
    text: "Medium risk",
    color: chartTheme.riskLabel.medium,
  },
  high: {
    text: "High risk",
    color: chartTheme.riskLabel.high,
  },
  critical: {
    text: "Very high risk",
    color: chartTheme.riskLabel.critical,
  },
  noRisk: {
    text: "Very Low risk",
    color: chartTheme.riskLabel.veryLow,
  },
  negligible: {
    text: "Negligible",
    color: chartTheme.riskLabel.veryLow,
  },
  minor: {
    text: "Minor",
    color: palette.status.success.text,
  },
  moderate: {
    text: "Moderate",
    color: chartTheme.riskLabel.medium,
  },
  major: {
    text: "Major",
    color: chartTheme.riskLabel.high,
  },
  catastrophic: {
    text: "Catastrophic",
    color: chartTheme.riskLabel.critical,
  },
  overdue: {
    text: "Overdue",
    color: chartTheme.riskLabel.critical,
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
