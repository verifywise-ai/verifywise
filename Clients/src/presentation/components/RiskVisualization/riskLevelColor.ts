import { chartTheme } from "../../themes/chartTheme";
import { riskLevelBucket, type RiskLevelBucket } from "../../../application/utils/riskLevel";

const BUCKET_LABEL: Record<RiskLevelBucket, string> = {
  veryLow: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  veryHigh: "Very high",
};

/**
 * Colour of a risk level label, from the same palette as the summary cards
 * above the risk tables. An unknown or empty level gets the very low colour.
 */
export function riskLevelColor(level: string | null | undefined): string {
  return chartTheme.riskSummary[riskLevelBucket(level) ?? "veryLow"];
}

/** Summary card name for a risk level label ("Very high"), or "Very low" when unknown. */
export function riskLevelBucketLabel(level: string | null | undefined): string {
  return BUCKET_LABEL[riskLevelBucket(level) ?? "veryLow"];
}
