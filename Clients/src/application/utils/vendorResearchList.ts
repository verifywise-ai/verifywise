/**
 * How the pending research findings are laid out: their order, their groups, and the counts the
 * summary above them is worded from. Counts and order only; the words are in
 * `vendorResearchPlainText.ts`.
 *
 * Everything here is computed from the rows the server sent, so the summary cannot say anything
 * the list under it does not show.
 */

import type {
  CredibilityLabel,
  ResearchCategory,
  VendorRiskFinding,
} from "../../domain/interfaces/i.vendorResearch";

/**
 * The risk levels of the vendor register, the most severe first, in lower case. The server writes
 * a finding's level as "{level} Risk" from the register's own matrix
 * (Servers/services/vendorResearch/validation.ts).
 */
const LEVELS = ["very high risk", "high risk", "medium risk", "low risk", "very low risk"];
/** The levels the summary counts as high: High and Very High. */
const HIGH_LEVELS = 2;

const CREDIBILITY: CredibilityLabel[] = ["high", "medium", "low"];

/** The categories in the order a run researches them, which is the order of the groups. */
const CATEGORIES: ResearchCategory[] = [
  "security_incidents",
  "certifications",
  "legal_regulatory",
  "ai_specific",
  "availability",
  "financial_health",
];

/** Where a value stands in a list; after every known one when the list does not have it. */
const rankIn = (list: readonly string[], value: unknown): number => {
  const index = typeof value === "string" ? list.indexOf(value.trim().toLowerCase()) : -1;
  return index === -1 ? list.length : index;
};

const levelRank = (finding: VendorRiskFinding): number => rankIn(LEVELS, finding.risk_level);
const credibilityRank = (finding: VendorRiskFinding): number =>
  rankIn(CREDIBILITY, finding.credibility);
const categoryRank = (category: unknown): number => rankIn(CATEGORIES, category);

/** The day a finding was made, as a number; 0 for a date that cannot be read, which sorts it last. */
const madeAt = (finding: VendorRiskFinding): number => {
  const time = Date.parse(finding.created_at);
  return Number.isNaN(time) ? 0 : time;
};

/**
 * A copy of the findings in the order a person should read them: the most severe risk level first,
 * then the better established (credibility), then the newest. The sort is stable, so findings that
 * are equal on all three stay in the server's order.
 */
export function orderFindings(rows: readonly VendorRiskFinding[]): VendorRiskFinding[] {
  return [...rows].sort(
    (a, b) =>
      levelRank(a) - levelRank(b) ||
      credibilityRank(a) - credibilityRank(b) ||
      madeAt(b) - madeAt(a),
  );
}

export interface FindingGroup {
  /** Unique among the groups of one list. */
  key: string;
  /** The category of the group, when the findings are grouped by category. */
  category: ResearchCategory | null;
  /** The vendor of the group, when the findings are grouped by vendor. */
  vendorId: number | null;
  /** The vendor's name as the list has it; null for a vendor whose rows carry none. */
  vendorName: string | null;
  /** The findings of the group, in reading order (`orderFindings`). */
  rows: VendorRiskFinding[];
}

/**
 * The findings in groups. One vendor's findings are grouped by category, in the order the
 * categories are researched (a category this file does not know goes last). The findings of every
 * vendor are grouped by vendor, by name, with a vendor that has no name last.
 */
export function groupFindings(
  rows: readonly VendorRiskFinding[],
  by: "category" | "vendor",
): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of orderFindings(rows)) {
    const key = by === "category" ? `category:${finding.category}` : `vendor:${finding.vendor_id}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        key,
        category: by === "category" ? finding.category : null,
        vendorId: by === "vendor" ? finding.vendor_id : null,
        vendorName:
          by === "vendor" && typeof finding.vendor_name === "string" && finding.vendor_name !== ""
            ? finding.vendor_name
            : null,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(finding);
  }

  const list = [...groups.values()];
  if (by === "category") {
    return list.sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
  }
  return list.sort((a, b) => {
    if (a.vendorName === null || b.vendorName === null) {
      return Number(a.vendorName === null) - Number(b.vendorName === null);
    }
    return a.vendorName.localeCompare(b.vendorName) || (a.vendorId ?? 0) - (b.vendorId ?? 0);
  });
}

export interface PendingSummary {
  /** How many findings are pending, as the server counts them. */
  total: number;
  /**
   * False when the server holds more than it sent: the counts below then describe a part of what
   * is pending, and the summary does not word them.
   */
  complete: boolean;
  /** How many of the rows are High or Very High risk. */
  high: number;
  /**
   * The two categories with the most rows, the larger first. Empty when every row is in one
   * category: the list's own heading says it then.
   */
  topics: Array<{ category: ResearchCategory; count: number }>;
  /** How many of the rows carry their earlier confidence as the credibility label. */
  earlier: number;
}

/** What the summary above the list is worded from. */
export function summarizeFindings(
  rows: readonly VendorRiskFinding[],
  total: number,
): PendingSummary {
  const counts = new Map<ResearchCategory, number>();
  for (const finding of rows) {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  }
  const topics = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || categoryRank(a.category) - categoryRank(b.category));

  return {
    total,
    complete: total <= rows.length,
    high: rows.filter((finding) => levelRank(finding) < HIGH_LEVELS).length,
    topics: topics.length < 2 ? [] : topics.slice(0, 2),
    earlier: rows.filter((finding) => finding.credibility_basis?.rule === "legacy_confidence")
      .length,
  };
}
