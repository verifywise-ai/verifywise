/**
 * @fileoverview Vendor risks as the Vendors page and the dashboard use them.
 *
 * `GET /vendorRisks/all` (a frozen legacy route) answers one row per
 * (vendor risk, use case of its vendor), so a risk whose vendor serves three
 * use cases arrives three times. Everything that counts, lists or exports
 * vendor risks goes through `distinctVendorRisks` first, which keeps each risk
 * once with the use cases of all its rows.
 *
 * @module application/utils/vendorRiskRows
 */

import type { VendorRisk } from "../../domain/types/VendorRisk";
import { riskLevelBucket, type RiskLevelBucket } from "./riskLevel";

/**
 * A row of `GET /vendorRisks/all`: one per (vendor risk, use case). The use
 * case is null when the vendor serves none.
 */
export type VendorRiskRow = Omit<VendorRisk, "project_id"> & {
  /** Older payloads and test fixtures may carry `id` instead of `risk_id`. */
  id?: number;
  project_id?: number | null;
  project_title?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  /** Present when the row was already made distinct. */
  project_ids?: number[];
  project_titles?: string[];
};

/** A vendor risk once, with every use case its vendor serves. */
export type DistinctVendorRisk = Omit<
  VendorRiskRow,
  "project_id" | "project_title" | "project_ids" | "project_titles"
> & {
  project_ids: number[];
  project_titles: string[];
};

const rowRiskId = (row: VendorRiskRow): number | undefined => row.risk_id ?? row.id;

/**
 * Each vendor risk once, in the order it first appears, with the ids and
 * titles of all its use cases (no repeats). Rows that are already distinct
 * pass through unchanged, so calling it twice is safe. A row without an id
 * can't be matched to another and is kept as it is.
 */
export function distinctVendorRisks(
  rows: VendorRiskRow[] | null | undefined,
): DistinctVendorRisk[] {
  const byId = new Map<number, DistinctVendorRisk>();
  const result: DistinctVendorRisk[] = [];

  for (const row of rows ?? []) {
    const { project_id, project_title, project_ids, project_titles, ...rest } = row;
    const ids = project_ids ?? (project_id != null ? [project_id] : []);
    const titles = project_titles ?? (project_title ? [project_title] : []);
    const id = rowRiskId(row);

    const existing = id === undefined ? undefined : byId.get(id);
    if (existing) {
      for (const projectId of ids) {
        if (!existing.project_ids.includes(projectId)) existing.project_ids.push(projectId);
      }
      for (const title of titles) {
        if (!existing.project_titles.includes(title)) existing.project_titles.push(title);
      }
      continue;
    }

    const risk: DistinctVendorRisk = {
      ...rest,
      ...(id !== undefined && { risk_id: id }),
      project_ids: Array.from(new Set(ids)),
      project_titles: Array.from(new Set(titles)),
    };
    if (id !== undefined) byId.set(id, risk);
    result.push(risk);
  }

  return result;
}

/** Number of distinct vendor risks per vendor id. */
export function vendorRiskCountByVendor(risks: VendorRiskRow[]): Map<number, number> {
  const seen = new Set<number>();
  const counts = new Map<number, number>();
  for (const risk of risks) {
    const id = rowRiskId(risk);
    if (id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    if (risk.vendor_id == null) continue;
    counts.set(risk.vendor_id, (counts.get(risk.vendor_id) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Level buckets, plus risks with no known level (shown as "Not assessed"). */
export type VendorRiskDistribution = Record<RiskLevelBucket, number> & { notAssessed: number };

export interface RecentVendorRisk {
  id: number;
  title: string;
  /** The stored level without " risk", lowercased; null when not assessed. */
  severity: string | null;
  created_at?: string;
  updated_at?: string;
  vendor_name: string;
}

export interface VendorRiskDashboardMetrics {
  total: number;
  distribution: VendorRiskDistribution;
  recent: RecentVendorRisk[];
}

const RECENT_LIMIT = 5;
const TITLE_LIMIT = 60;

/** A recent-activity title: the description cut at 60 characters, as incidents are. */
const shortTitle = (description: string | null | undefined): string => {
  const text = description?.trim();
  if (!text) return "Vendor risk";
  return text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT)}...` : text;
};

const toIso = (value: string | Date | null | undefined): string | undefined => {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

const lastTouched = (risk: { created_at?: string; updated_at?: string }): number => {
  const value = risk.updated_at || risk.created_at;
  return value ? new Date(value).getTime() : 0;
};

/**
 * The dashboard's vendor risk card and recent activity, from the rows of
 * `GET /vendorRisks/all`. Each risk counts once; a risk without a known level
 * counts as notAssessed, so the buckets add up to the total; the recent list is the most
 * recently changed risks, newest first, titled by their description.
 */
export function buildVendorRiskDashboardMetrics(
  rows: VendorRiskRow[] | null | undefined,
): VendorRiskDashboardMetrics {
  const risks = distinctVendorRisks(rows);
  const distribution: VendorRiskDistribution = {
    veryHigh: 0,
    high: 0,
    medium: 0,
    low: 0,
    veryLow: 0,
    notAssessed: 0,
  };

  for (const risk of risks) {
    const bucket = riskLevelBucket(risk.risk_level);
    if (bucket) distribution[bucket]++;
    else distribution.notAssessed++;
  }

  const recent = risks
    .filter((risk) => risk.risk_id !== undefined)
    .map((risk): RecentVendorRisk => ({
      id: risk.risk_id!,
      title: shortTitle(risk.risk_description),
      severity: risk.risk_level
        ? risk.risk_level
            .trim()
            .toLowerCase()
            .replace(/\s+risk$/, "")
        : null,
      created_at: toIso(risk.created_at),
      updated_at: toIso(risk.updated_at),
      vendor_name: risk.vendor_name || "",
    }))
    .sort((a, b) => lastTouched(b) - lastTouched(a))
    .slice(0, RECENT_LIMIT);

  return { total: risks.length, distribution, recent };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

interface NamedUser {
  id: number | string;
  name?: string | null;
  surname?: string | null;
}

const userName = (users: NamedUser[], id: number | null | undefined): string | undefined => {
  if (id === null || id === undefined) return undefined;
  const user = users.find((u) => String(u.id) === String(id));
  return user ? `${user.name ?? ""} ${user.surname ?? ""}`.trim() || undefined : undefined;
};

export interface VendorRiskExportRow {
  risk_description: string;
  vendor_name: string;
  project_titles: string;
  action_owner: string;
  risk_severity: string;
  likelihood: string;
  risk_level: string;
}

/** One export row per distinct vendor risk, in the given order. */
export function buildVendorRiskExportRows(
  risks: VendorRiskRow[],
  context: { users: NamedUser[]; vendorNames: Map<number, string> },
): VendorRiskExportRow[] {
  return distinctVendorRisks(risks).map((risk) => ({
    risk_description: risk.risk_description || "-",
    vendor_name:
      (risk.vendor_id != null ? context.vendorNames.get(risk.vendor_id) : undefined) ||
      risk.vendor_name ||
      "-",
    project_titles: risk.project_titles.length ? risk.project_titles.join(", ") : "-",
    action_owner: userName(context.users, risk.action_owner) ?? "-",
    risk_severity: risk.risk_severity || "-",
    likelihood: risk.likelihood || "-",
    risk_level: risk.risk_level || "-",
  }));
}

interface ExportableVendor {
  id?: number;
  vendor_name: string;
  assignee?: number | null;
  review_status?: string | null;
  risk_score?: number | null;
  review_date?: string | Date | null;
  projects?: number[];
}

export interface VendorExportRow {
  vendor_name: string;
  assignee: string;
  review_status: string;
  use_cases: string;
  risk_count: number;
  scorecard: string;
  review_date: string;
}

/**
 * One export row per vendor. `formatDate` is the table's own date formatter,
 * so the review date reads as the same calendar day in both.
 */
export function buildVendorExportRows(
  vendors: ExportableVendor[],
  context: {
    users: NamedUser[];
    projectTitles: Map<number, string>;
    riskCounts: Map<number, number>;
    formatDate: (date: string | Date) => string;
  },
): VendorExportRow[] {
  return vendors.map((vendor) => ({
    vendor_name: vendor.vendor_name,
    assignee: userName(context.users, vendor.assignee) ?? "Unassigned",
    review_status: vendor.review_status || "Not started",
    use_cases:
      (vendor.projects ?? [])
        .map((id) => context.projectTitles.get(id))
        .filter((title): title is string => !!title)
        .join(", ") || "-",
    risk_count: vendor.id != null ? (context.riskCounts.get(vendor.id) ?? 0) : 0,
    scorecard:
      vendor.risk_score !== null && vendor.risk_score !== undefined
        ? `${vendor.risk_score}%`
        : "N/A",
    review_date: vendor.review_date ? context.formatDate(vendor.review_date) : "N/A",
  }));
}
