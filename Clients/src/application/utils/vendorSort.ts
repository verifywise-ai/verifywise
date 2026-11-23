/**
 * @fileoverview Sort order of the vendor table.
 *
 * People sort by display name, not by user id. A vendor without a review date
 * or assignee goes last in either direction, rather than comparing as NaN.
 *
 * @module application/utils/vendorSort
 */

import { ReviewStatus } from "../../domain/enums/status.enum";
import { compareNames, userSortName } from "./userSort";
import { vendorRiskLevelRank } from "./riskLevel";

export type SortDirection = "asc" | "desc";

interface SortableVendor {
  id?: number;
  vendor_name: string;
  assignee?: number | null;
  review_status?: string | null;
  review_date?: string | Date | null;
  risk_score?: number | null;
}

export interface VendorSortContext {
  /** Display name by user id, from `buildUserSortNames`. */
  userNames: Map<string, string>;
  /** Distinct vendor risks per vendor id. */
  riskCounts: Map<number, number>;
}

const STATUS_ORDER: Record<string, number> = {
  [ReviewStatus.NotStarted]: 1,
  [ReviewStatus.InReview]: 2,
  [ReviewStatus.RequiresFollowUp]: 3,
  [ReviewStatus.Reviewed]: 4,
};

const dateValue = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/** Empty values last in both directions; otherwise `compare` in the direction asked. */
const withEmptyLast = <T>(
  a: T | null,
  b: T | null,
  direction: SortDirection,
  compare: (x: T, y: T) => number,
): number => {
  const aEmpty = a === null;
  const bEmpty = b === null;
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const result = compare(a, b);
  return direction === "asc" ? result : -result;
};

/** Compares two vendors on a vendor table column, direction included. */
export function compareVendors(
  a: SortableVendor,
  b: SortableVendor,
  key: string,
  direction: SortDirection,
  context: VendorSortContext,
): number {
  const sign = direction === "asc" ? 1 : -1;
  switch (key) {
    case "vendor_name":
      return sign * compareNames(a.vendor_name ?? "", b.vendor_name ?? "");
    case "assignee":
      return withEmptyLast(
        userSortName(context.userNames, a.assignee) || null,
        userSortName(context.userNames, b.assignee) || null,
        direction,
        compareNames,
      );
    case "review_status":
      return (
        sign *
        ((STATUS_ORDER[a.review_status ?? ""] ?? 0) - (STATUS_ORDER[b.review_status ?? ""] ?? 0))
      );
    case "review_date":
      return withEmptyLast(
        dateValue(a.review_date),
        dateValue(b.review_date),
        direction,
        (x, y) => x - y,
      );
    case "scorecard":
      // Not assessed (no score) sorts below a score of 0.
      return sign * ((a.risk_score ?? -1) - (b.risk_score ?? -1));
    case "risk":
      return (
        sign *
        ((a.id != null ? (context.riskCounts.get(a.id) ?? 0) : 0) -
          (b.id != null ? (context.riskCounts.get(b.id) ?? 0) : 0))
      );
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Vendor risks table
// ---------------------------------------------------------------------------

interface SortableVendorRisk {
  risk_description?: string | null;
  vendor_name?: string | null;
  project_titles?: string | string[] | null;
  action_owner?: number | null;
  risk_severity?: string | null;
  likelihood?: string | null;
  risk_level?: string | null;
  inherited_by?: number;
}

const SEVERITY_ORDER = ["negligible", "minor", "moderate", "major", "critical", "catastrophic"];
const LIKELIHOOD_ORDER = ["rare", "unlikely", "possible", "likely", "almost certain"];

/** 1-based position in `order` (case-insensitive), 0 when unknown or empty. */
const rankIn = (order: string[], value: string | null | undefined): number =>
  order.indexOf((value ?? "").trim().toLowerCase()) + 1;

const titlesOf = (value: string | string[] | null | undefined): string =>
  Array.isArray(value) ? value.join(", ") : (value ?? "");

/**
 * Ascending comparison of two vendor risks on a risks table column (the table
 * flips it for descending). The action owner sorts by display name; the level
 * runs Not assessed, No risk, Low, Medium, High, Very high.
 */
export function compareVendorRisks(
  a: SortableVendorRisk,
  b: SortableVendorRisk,
  key: string,
  userNames: Map<string, string>,
): number {
  switch (key) {
    case "risk_description":
      return compareNames(a.risk_description ?? "", b.risk_description ?? "");
    case "vendor_name":
      return compareNames(a.vendor_name ?? "", b.vendor_name ?? "");
    case "project_titles":
      return compareNames(titlesOf(a.project_titles), titlesOf(b.project_titles));
    case "action_owner":
      return compareNames(
        userSortName(userNames, a.action_owner),
        userSortName(userNames, b.action_owner),
      );
    case "risk_severity":
      return rankIn(SEVERITY_ORDER, a.risk_severity) - rankIn(SEVERITY_ORDER, b.risk_severity);
    case "likelihood":
      return rankIn(LIKELIHOOD_ORDER, a.likelihood) - rankIn(LIKELIHOOD_ORDER, b.likelihood);
    case "risk_level":
      return vendorRiskLevelRank(a.risk_level) - vendorRiskLevelRank(b.risk_level);
    case "inherited_by":
      return (a.inherited_by ?? 0) - (b.inherited_by ?? 0);
    default:
      return 0;
  }
}
