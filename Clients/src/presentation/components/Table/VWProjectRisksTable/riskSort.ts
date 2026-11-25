import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { riskCalendarDay } from "../../../tools/isoDateToString";
import { getEffectiveRiskLevel, riskLevelRank } from "../../../../application/utils/riskLevel";
import { compareNames } from "../../../../application/utils/userSort";
import { getMitigationStatus } from "../../../../application/utils/mitigationStatus";

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

/** Resolves a risk's owner to the display name the Owner column shows. */
export type OwnerNameLookup = (risk: RiskModel) => string;

const sortValue = (
  risk: RiskModel,
  key: string,
  ownerName: OwnerNameLookup,
): string | number | null | undefined => {
  switch (key) {
    // Strings go to compareNames as they are: it owns the case folding.
    case "risk_name":
      return risk.risk_name ?? "";
    case "risk_owner":
      return ownerName(risk);
    case "severity":
      return getSeverityValue(risk.severity);
    case "mitigation_status":
      // Sorted as shown: no status is Not Started.
      return getMitigationStatus(risk);
    case "risk_level_autocalculated":
      // The column shows the effective level, so it sorts by it.
      return riskLevelRank(getEffectiveRiskLevel(risk));
    case "deadline":
      // undefined: no deadline (it is optional), sorted last either way.
      return riskCalendarDay(risk.deadline)?.getTime();
    case "ale_estimate":
      return risk.ale_estimate ?? 0;
    default:
      return null;
  }
};

/**
 * Comparator for the risk table. Unknown keys keep the original order. The
 * Owner column sorts by the owner's display name, so pass a lookup for it.
 */
export const compareRisks = (
  a: RiskModel,
  b: RiskModel,
  key: string,
  direction: RiskSortDirection,
  ownerName: OwnerNameLookup = () => "",
): number => {
  const aValue = sortValue(a, key, ownerName);
  const bValue = sortValue(b, key, ownerName);
  if (aValue === null || bValue === null) return 0;
  // A risk without a deadline is not the most urgent: last in both directions.
  if (aValue === undefined || bValue === undefined) {
    if (aValue === bValue) return 0;
    return aValue === undefined ? 1 : -1;
  }

  const sign = direction === "asc" ? 1 : -1;
  if (typeof aValue === "string" && typeof bValue === "string") {
    return sign * compareNames(aValue, bValue);
  }
  if (aValue < bValue) return -sign;
  if (aValue > bValue) return sign;
  return 0;
};

export interface RiskSortState {
  key: string;
  direction: RiskSortDirection | null;
}

const NO_SORT: RiskSortState = { key: "", direction: null };

/**
 * Reads a sort saved in localStorage. Anything unreadable, or on a column that
 * is not sortable (any more), means no sort.
 */
export const parseSavedRiskSort = (
  raw: string | null,
  sortableKeys: readonly string[],
): RiskSortState => {
  if (!raw) return NO_SORT;
  try {
    const saved = JSON.parse(raw);
    const direction = saved?.direction;
    if (
      typeof saved?.key === "string" &&
      sortableKeys.includes(saved.key) &&
      (direction === "asc" || direction === "desc")
    ) {
      return { key: saved.key, direction };
    }
  } catch {
    // fall through
  }
  return NO_SORT;
};
