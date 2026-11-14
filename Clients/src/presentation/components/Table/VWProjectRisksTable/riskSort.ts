import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { riskCalendarDay } from "../../../tools/isoDateToString";
import { getEffectiveRiskLevel, riskLevelRank } from "../../../../application/utils/riskLevel";

export type RiskSortDirection = "asc" | "desc";

// Risks created by intake, MCP, the advisor or the API can leave any of these
// fields null, so every string read goes through this.
const lower = (value: string | null | undefined): string => (value ?? "").toLowerCase();

// Severity values: Negligible, Minor, Moderate, Major, Catastrophic
const getSeverityValue = (severity: string | null | undefined): number => {
  const severityLower = lower(severity);
  if (severityLower.includes("catastrophic")) return 5;
  if (severityLower.includes("major")) return 4;
  if (severityLower.includes("moderate")) return 3;
  if (severityLower.includes("minor")) return 2;
  if (severityLower.includes("negligible")) return 1;
  return 0;
};

const sortValue = (risk: RiskModel, key: string): string | number | null => {
  switch (key) {
    case "risk_name":
      return lower(risk.risk_name);
    case "risk_owner":
      return risk.risk_owner ?? 0;
    case "severity":
      return getSeverityValue(risk.severity);
    case "mitigation_status":
      return lower(risk.mitigation_status);
    case "risk_level_autocalculated":
      // The column shows the effective level, so it sorts by it.
      return riskLevelRank(getEffectiveRiskLevel(risk));
    case "deadline":
      return riskCalendarDay(risk.deadline)?.getTime() ?? 0;
    case "ale_estimate":
      return risk.ale_estimate ?? 0;
    case "controls_mapping":
      return lower(risk.controls_mapping);
    default:
      return null;
  }
};

/** Comparator for the risk table. Unknown keys keep the original order. */
export const compareRisks = (
  a: RiskModel,
  b: RiskModel,
  key: string,
  direction: RiskSortDirection,
): number => {
  const aValue = sortValue(a, key);
  const bValue = sortValue(b, key);
  if (aValue === null || bValue === null) return 0;

  const sign = direction === "asc" ? 1 : -1;
  if (typeof aValue === "string" && typeof bValue === "string") {
    return sign * aValue.localeCompare(bValue);
  }
  if (aValue < bValue) return -sign;
  if (aValue > bValue) return sign;
  return 0;
};
