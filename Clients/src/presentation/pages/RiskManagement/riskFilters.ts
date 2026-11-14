/**
 * @fileoverview Filter options and the field getter for the Risk management
 * table. Option values are the stored enum values, so a filter matches rows.
 *
 * @module presentation/pages/RiskManagement/riskFilters
 */

import type { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { Severity } from "../../../domain/enums/severity.enum";
import { RiskLevelAutoCalculated } from "../../../domain/enums/riskLevelAutoCalculated.enum";
import type { FilterCondition } from "../../components/Table/FilterBy";
import { riskCalendarDay } from "../../tools/isoDateToString";
import {
  getEffectiveRiskLevel,
  riskLevelBucket,
  type RiskLevelBucket,
} from "../../../application/utils/riskLevel";

/** Severity values as stored on a risk. */
export const SEVERITY_OPTIONS = Object.values(Severity).map((value) => ({ value, label: value }));

/**
 * Risk levels as stored (`current_risk_level`, else `risk_level_autocalculated`),
 * highest first. Matching ignores case, so "Very low risk" also covers any
 * legacy "Very Low risk" spelling.
 */
export const RISK_LEVEL_OPTIONS = [
  RiskLevelAutoCalculated.VeryHighRisk,
  RiskLevelAutoCalculated.HighRisk,
  RiskLevelAutoCalculated.MediumRisk,
  RiskLevelAutoCalculated.LowRisk,
  RiskLevelAutoCalculated.VeryLowRisk,
  RiskLevelAutoCalculated.NoRisk,
].map((value) => ({ value, label: value }));

const CARD_KEY_BY_BUCKET: Record<RiskLevelBucket, string> = {
  veryHigh: "Very high",
  high: "High",
  medium: "Medium",
  low: "Low",
  veryLow: "Very low",
};

/**
 * The summary card for a risk level ("No risk" counts in the very-low card),
 * so the card shows as selected. Null when the level is unknown.
 */
export function riskLevelCardKey(level: string): string | null {
  const bucket = riskLevelBucket(level);
  return bucket ? CARD_KEY_BY_BUCKET[bucket] : null;
}

/** The risk-level condition's operator and value, or "" when there is none. */
function riskLevelSignature(conditions: FilterCondition[]): string {
  const condition = conditions.find((c) => c.columnId === "risk_level");
  return condition ? `${condition.operator}|${condition.value}` : "";
}

/**
 * The summary card to select after a filter change. Only a change to the
 * risk-level condition moves the card: it then follows that condition, or
 * clears when the condition is gone. Any other filter change returns
 * `undefined`, meaning keep the card the user picked.
 */
export function riskLevelCardAfterFilterChange(
  previous: FilterCondition[],
  next: FilterCondition[],
): string | null | undefined {
  if (riskLevelSignature(previous) === riskLevelSignature(next)) return undefined;
  const condition = next.find((c) => c.columnId === "risk_level");
  if (condition && condition.operator === "is" && condition.value) {
    return riskLevelCardKey(condition.value);
  }
  return null;
}

/** Reads a filter column's value from a risk. */
export function getRiskFieldValue(
  risk: RiskModel,
  fieldId: string,
): string | number | Date | null | undefined {
  switch (fieldId) {
    case "risk_name":
      return risk.risk_name;
    case "risk_description":
      return risk.risk_description;
    case "severity":
      return risk.severity;
    case "risk_level":
      return getEffectiveRiskLevel(risk) || undefined;
    case "mitigation_status":
      return risk.mitigation_status;
    case "risk_owner":
      return risk.risk_owner?.toString();
    case "impact":
      return risk.impact;
    case "deadline":
      return riskCalendarDay(risk.deadline);
    case "date_of_assessment":
      return riskCalendarDay(risk.date_of_assessment);
    default:
      return null;
  }
}
