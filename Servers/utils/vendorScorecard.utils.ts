/**
 * A vendor's scorecard risk score (0-100), computed on the server from its
 * four scorecard answers. The client's preview in the vendor drawer uses the
 * same table (Clients/src/domain/utils/vendorScorecard.utils.ts); the stored
 * value is always this one, whatever a request sends as risk_score.
 *
 * score = 100 * (0.3 * sensitivity + 0.3 * criticality + 0.2 * past issues
 *                + 0.2 * regulatory exposure), each answer normalized to 0-1
 * against the highest value of its scale, rounded to a whole number.
 *
 * A vendor with no scorecard answer has no score (null): it is "Not
 * assessed", not 0%.
 */

const DATA_SENSITIVITY: Record<string, number> = {
  None: 0,
  "Internal only": 1,
  "Personally identifiable information (PII)": 2,
  "Financial data": 4,
  "Health data (e.g. HIPAA)": 5,
  "Model weights or AI assets": 3,
  "Other sensitive data": 2,
};

const BUSINESS_CRITICALITY: Record<string, number> = {
  "Low (vendor supports non-core functions)": 1,
  "Medium (affects operations but is replaceable)": 2,
  "High (critical to core services or products)": 3,
};

const PAST_ISSUES: Record<string, number> = {
  None: 0,
  "Minor incident (e.g. small delay, minor bug)": 1,
  "Major incident (e.g. data breach, legal issue)": 3,
};

const REGULATORY_EXPOSURE: Record<string, number> = {
  None: 0,
  "GDPR (EU)": 1,
  "HIPAA (US)": 1,
  "SOC 2": 1,
  "ISO 27001": 1,
  "EU AI act": 1,
  "CCPA (california)": 1,
  Other: 1,
};

const DIMENSIONS: {
  field: keyof VendorScorecard;
  scale: Record<string, number>;
  weight: number;
}[] = [
  { field: "data_sensitivity", scale: DATA_SENSITIVITY, weight: 0.3 },
  { field: "business_criticality", scale: BUSINESS_CRITICALITY, weight: 0.3 },
  { field: "past_issues", scale: PAST_ISSUES, weight: 0.2 },
  { field: "regulatory_exposure", scale: REGULATORY_EXPOSURE, weight: 0.2 },
];

export interface VendorScorecard {
  data_sensitivity?: string | null;
  business_criticality?: string | null;
  past_issues?: string | null;
  regulatory_exposure?: string | null;
}

/** The score for a vendor's scorecard answers, or null when none is answered. */
export const calculateVendorRiskScore = (scorecard: VendorScorecard): number | null => {
  let answered = false;
  let score = 0;
  for (const { field, scale, weight } of DIMENSIONS) {
    const value = scorecard[field];
    if (value === undefined || value === null || value === "") continue;
    answered = true;
    const max = Math.max(...Object.values(scale));
    score += ((scale[value] ?? 0) / max) * weight;
  }
  if (!answered) return null;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
};
