export type RiskLevel = {
  level: string;
  color: string;
};

type RiskScales = {
  [key: string]: number;
};

import {
  RiskLikelihood as AppRiskLikelihood,
  RiskSeverity as AppRiskSeverity,
} from "../components/RiskLevel/riskValues";
import { RISK_LABELS } from "../components/RiskLevel/constants";

export class RiskCalculator {
  private static readonly LIKELIHOOD_WEIGHT = 1;
  private static readonly SEVERITY_WEIGHT = 3;

  private static readonly likelihoodScale: RiskScales = {
    [AppRiskLikelihood.Rare]: 1,
    [AppRiskLikelihood.Unlikely]: 2,
    [AppRiskLikelihood.Possible]: 3,
    [AppRiskLikelihood.Likely]: 4,
    [AppRiskLikelihood.AlmostCertain]: 5,
  };

  private static readonly severityScale: RiskScales = {
    [AppRiskSeverity.Negligible]: 1,
    [AppRiskSeverity.Minor]: 2,
    [AppRiskSeverity.Moderate]: 3,
    [AppRiskSeverity.Major]: 4,
    [AppRiskSeverity.Catastrophic]: 5,
  };

  public static getRiskLevel(likelihood: AppRiskLikelihood, severity: AppRiskSeverity): RiskLevel {
    const score = this.calculateWeightedRisk(likelihood, severity);
    return this.mapRiskLevel(score);
  }

  private static calculateWeightedRisk(
    likelihood: AppRiskLikelihood,
    severity: AppRiskSeverity,
  ): number {
    const likelihoodValue =
      typeof likelihood === "string"
        ? this.likelihoodScale[likelihood as AppRiskLikelihood] || 0
        : this.mapAppLikelihoodToCalculator(likelihood as AppRiskLikelihood);

    const severityValue =
      typeof severity === "string"
        ? this.severityScale[severity as AppRiskSeverity] || 0
        : this.mapAppSeverityToCalculator(severity as AppRiskSeverity);

    return likelihoodValue * this.LIKELIHOOD_WEIGHT + severityValue * this.SEVERITY_WEIGHT;
  }

  private static mapAppLikelihoodToCalculator(likelihood: AppRiskLikelihood): number {
    switch (likelihood) {
      case AppRiskLikelihood.Rare:
        return 1;
      case AppRiskLikelihood.Unlikely:
        return 2;
      case AppRiskLikelihood.Possible:
        return 3;
      case AppRiskLikelihood.Likely:
        return 4;
      case AppRiskLikelihood.AlmostCertain:
        return 5;
      default:
        return 0;
    }
  }

  private static mapAppSeverityToCalculator(severity: AppRiskSeverity): number {
    switch (severity) {
      case AppRiskSeverity.Negligible:
        return 1;
      case AppRiskSeverity.Minor:
        return 2;
      case AppRiskSeverity.Moderate:
        return 3;
      case AppRiskSeverity.Major:
        return 4;
      case AppRiskSeverity.Catastrophic:
        return 5;
      default:
        return 0;
    }
  }

  private static mapRiskLevel(score: number): RiskLevel {
    if (score <= 4) {
      return { level: "No risk", color: RISK_LABELS.noRisk.color };
    } else if (score <= 8) {
      return { level: "Low risk", color: RISK_LABELS.low.color };
    } else if (score <= 12) {
      return { level: "Medium risk", color: RISK_LABELS.medium.color };
    } else if (score <= 16) {
      return { level: "High risk", color: RISK_LABELS.high.color };
    } else {
      return { level: "Very high risk", color: RISK_LABELS.critical.color };
    }
  }
}
