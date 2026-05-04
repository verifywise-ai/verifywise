import {
  DataSensitivity,
  BusinessCriticality,
  PastIssues,
  RegulatoryExposure,
} from "../enums/status.enum";

export const DATA_SENSITIVITY_VALUES: Record<DataSensitivity, number> = {
  [DataSensitivity.None]: 0,
  [DataSensitivity.InternalOnly]: 1,
  [DataSensitivity.PII]: 2,
  [DataSensitivity.FinancialData]: 4,
  [DataSensitivity.HealthData]: 5,
  [DataSensitivity.ModelWeights]: 3,
  [DataSensitivity.OtherSensitive]: 2,
};

export const BUSINESS_CRITICALITY_VALUES: Record<BusinessCriticality, number> = {
  [BusinessCriticality.Low]: 1,
  [BusinessCriticality.Medium]: 2,
  [BusinessCriticality.High]: 3,
};

export const PAST_ISSUES_VALUES: Record<PastIssues, number> = {
  [PastIssues.None]: 0,
  [PastIssues.MinorIncident]: 1,
  [PastIssues.MajorIncident]: 3,
};

export const REGULATORY_EXPOSURE_VALUES: Record<RegulatoryExposure, number> = {
  [RegulatoryExposure.None]: 0,
  [RegulatoryExposure.GDPR]: 1,
  [RegulatoryExposure.HIPAA]: 1,
  [RegulatoryExposure.SOC2]: 1,
  [RegulatoryExposure.ISO27001]: 1,
  [RegulatoryExposure.EUAIAct]: 1,
  [RegulatoryExposure.CCPA]: 1,
  [RegulatoryExposure.Other]: 1,
};

// Maximum possible values for normalization
const MAX_DATA_SENSITIVITY = Math.max(...Object.values(DATA_SENSITIVITY_VALUES));
const MAX_BUSINESS_CRITICALITY = Math.max(...Object.values(BUSINESS_CRITICALITY_VALUES));
const MAX_PAST_ISSUES = Math.max(...Object.values(PAST_ISSUES_VALUES));
const MAX_REGULATORY_EXPOSURE = Math.max(...Object.values(REGULATORY_EXPOSURE_VALUES));

export interface VendorScorecardData {
  data_sensitivity?: DataSensitivity | string;
  business_criticality?: BusinessCriticality | string;
  past_issues?: PastIssues | string;
  regulatory_exposure?: RegulatoryExposure | string;
}

export const calculateVendorRiskScore = (scorecard: VendorScorecardData): number => {
  // Validate input
  if (!scorecard || typeof scorecard !== "object") {
    return 0;
  }

  // Get normalized values (0-1 scale) with safety checks
  const dataSensitivityValue =
    scorecard.data_sensitivity &&
    DATA_SENSITIVITY_VALUES[scorecard.data_sensitivity as DataSensitivity]
      ? DATA_SENSITIVITY_VALUES[scorecard.data_sensitivity as DataSensitivity] /
        MAX_DATA_SENSITIVITY
      : 0;

  const businessCriticalityValue =
    scorecard.business_criticality &&
    BUSINESS_CRITICALITY_VALUES[scorecard.business_criticality as BusinessCriticality]
      ? BUSINESS_CRITICALITY_VALUES[scorecard.business_criticality as BusinessCriticality] /
        MAX_BUSINESS_CRITICALITY
      : 0;

  const pastIssuesValue =
    scorecard.past_issues && PAST_ISSUES_VALUES[scorecard.past_issues as PastIssues]
      ? PAST_ISSUES_VALUES[scorecard.past_issues as PastIssues] / MAX_PAST_ISSUES
      : 0;

  const regulatoryExposureValue =
    scorecard.regulatory_exposure &&
    REGULATORY_EXPOSURE_VALUES[scorecard.regulatory_exposure as RegulatoryExposure]
      ? REGULATORY_EXPOSURE_VALUES[scorecard.regulatory_exposure as RegulatoryExposure] /
        MAX_REGULATORY_EXPOSURE
      : 0;

  // Calculate weighted score as per requirements
  // Risk Score = (data sensitivity × 0.3) + (business criticality × 0.3) + (past issues × 0.2) + (regulatory exposure × 0.2)
  const riskScore =
    dataSensitivityValue * 0.3 +
    businessCriticalityValue * 0.3 +
    pastIssuesValue * 0.2 +
    regulatoryExposureValue * 0.2;

  // Return score as percentage (0-100) with bounds checking
  const percentage = Math.round(riskScore * 100);
  return Math.max(0, Math.min(100, percentage));
};

export const getRiskScoreLevel = (score: number): string => {
  if (score >= 80) return "Very High";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  if (score >= 20) return "Low";
  return "Very Low";
};

export const getRiskScoreColor = (score: number): string => {
  if (score >= 80) return "#B71C1C"; // Critical - using existing risk color
  if (score >= 60) return "#E65100"; // High - using existing risk color
  if (score >= 40) return "#8D6E63"; // Medium - using existing risk color
  if (score >= 20) return "#2E7D32"; // Low - using existing risk color
  return "#33691E"; // Very Low - using existing risk color
};
