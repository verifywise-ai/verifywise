import {
  getVendorCoverageScanRowsQuery,
  getVendorDuplicateScanRowsQuery,
  getVendorExposureRowsQuery,
  UseCaseRef,
  VendorCoverageScanRow,
} from "../../utils/vendorRiskReport.utils";
import {
  DUPLICATE_SIMILARITY_THRESHOLD,
  jaccard,
  MAX_DUPLICATE_PAIRS,
  MAX_DUPLICATE_RESULTS,
  MAX_DUPLICATE_SCAN,
  tokeniseText,
} from "./duplicates";

/**
 * The vendor risk insights on the Vendors page. Read-only, like F7 and F8:
 * nothing here writes a link, a cache row or a notification.
 */

// ---------------------------------------------------------------------------
// Exposure (blast radius)
// ---------------------------------------------------------------------------

export interface VendorRiskExposure {
  vendor_risk_id: number;
  /** Project risks with a confirmed inherits_from link to this vendor risk. */
  children: number;
  /** Open suggestions: shown, never counted as exposure. */
  suggested: number;
  use_cases: UseCaseRef[];
}

export interface VendorExposureSummary {
  vendor_id: number;
  vendor_name: string | null;
  vendor_risks: number;
  /** Vendor risks with at least one confirmed child. */
  linked_vendor_risks: number;
  /** Distinct project risks inheriting from any of the vendor's risks. */
  inheriting_risks: number;
  suggested: number;
  use_cases: UseCaseRef[];
}

export interface VendorExposureReport {
  risks: VendorRiskExposure[];
  /** Widest reach first. */
  vendors: VendorExposureSummary[];
}

/**
 * How far each vendor risk reaches through value-chain inheritance. A project
 * risk counts once per vendor even when it inherits through two of the
 * vendor's risks, and a use case counts once however many children sit in it.
 */
export async function findVendorExposure(organizationId: number): Promise<VendorExposureReport> {
  const rows = await getVendorExposureRowsQuery(organizationId);

  const risks: VendorRiskExposure[] = rows.map((row) => ({
    vendor_risk_id: row.vendor_risk_id,
    children: row.child_ids.length,
    suggested: row.suggested,
    use_cases: row.use_cases,
  }));

  const byVendor = new Map<
    number,
    {
      vendor_name: string | null;
      vendor_risks: number;
      linked_vendor_risks: number;
      children: Set<number>;
      suggested: number;
      use_cases: Map<number, UseCaseRef>;
    }
  >();
  for (const row of rows) {
    if (row.vendor_id === null) continue;
    let entry = byVendor.get(row.vendor_id);
    if (!entry) {
      entry = {
        vendor_name: row.vendor_name,
        vendor_risks: 0,
        linked_vendor_risks: 0,
        children: new Set(),
        suggested: 0,
        use_cases: new Map(),
      };
      byVendor.set(row.vendor_id, entry);
    }
    entry.vendor_risks += 1;
    if (row.child_ids.length > 0) entry.linked_vendor_risks += 1;
    for (const id of row.child_ids) entry.children.add(id);
    entry.suggested += row.suggested;
    for (const useCase of row.use_cases) entry.use_cases.set(useCase.id, useCase);
  }

  const vendors: VendorExposureSummary[] = [...byVendor.entries()]
    .map(([vendorId, entry]) => ({
      vendor_id: vendorId,
      vendor_name: entry.vendor_name,
      vendor_risks: entry.vendor_risks,
      linked_vendor_risks: entry.linked_vendor_risks,
      inheriting_risks: entry.children.size,
      suggested: entry.suggested,
      use_cases: [...entry.use_cases.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort(
      (a, b) =>
        b.inheriting_risks - a.inheriting_risks ||
        b.use_cases.length - a.use_cases.length ||
        (a.vendor_name ?? "").localeCompare(b.vendor_name ?? ""),
    );

  return { risks, vendors };
}

// ---------------------------------------------------------------------------
// Duplicate candidates
// ---------------------------------------------------------------------------

interface VendorRiskRef {
  id: number;
  risk_description: string | null;
  risk_level: string | null;
  action_owner: number | null;
}

export interface VendorDuplicateCandidate {
  vendor: { id: number; name: string | null };
  risk_a: VendorRiskRef;
  risk_b: VendorRiskRef;
  similarity: number; // rounded to 2 decimals
  shared_tokens: string[];
}

export interface VendorDuplicateReport {
  scanned: number;
  compared: number;
  matched: number;
  truncated: boolean;
  candidates: VendorDuplicateCandidate[];
}

/**
 * Pairs of the same vendor's risks that read like one risk entered twice.
 * Same tokeniser, Jaccard score and caps as F7, over description + impact.
 *
 * Blocked by vendor, not compared org-wide: two vendors carrying "training
 * data leaks" is a pattern across suppliers, not a duplicate to clean up.
 * The threshold is F7's and was tuned on project risks only; vendor risk text
 * is shorter, so treat early results as a first cut, not a calibrated one.
 */
export async function findVendorDuplicateCandidates(
  organizationId: number,
): Promise<VendorDuplicateReport> {
  const rows = await getVendorDuplicateScanRowsQuery(organizationId, MAX_DUPLICATE_SCAN);
  const tokens = rows.map((row) =>
    tokeniseText(`${row.risk_description ?? ""} ${row.impact_description ?? ""}`),
  );

  const buckets = new Map<number, number[]>();
  rows.forEach((row, index) => {
    if (row.vendor_id === null) return;
    const bucket = buckets.get(row.vendor_id);
    if (bucket) bucket.push(index);
    else buckets.set(row.vendor_id, [index]);
  });

  const scored: { a: number; b: number; similarity: number; shared: string[] }[] = [];
  let compared = 0;
  let pairCapHit = false;

  for (const bucket of buckets.values()) {
    for (let x = 0; x < bucket.length && !pairCapHit; x++) {
      for (let y = x + 1; y < bucket.length; y++) {
        if (compared >= MAX_DUPLICATE_PAIRS) {
          pairCapHit = true;
          break;
        }
        // Rows arrive in id order, so bucket order is id order too.
        const a = bucket[x];
        const b = bucket[y];
        if (tokens[a].size === 0 || tokens[b].size === 0) continue;
        compared += 1;
        const similarity = jaccard(tokens[a], tokens[b]);
        if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) continue;
        const shared = [...tokens[a]].filter((token) => tokens[b].has(token)).sort();
        scored.push({ a, b, similarity, shared });
      }
    }
    if (pairCapHit) break;
  }

  scored.sort((p, q) => q.similarity - p.similarity || rows[p.a].id - rows[q.a].id);

  const ref = (index: number): VendorRiskRef => ({
    id: rows[index].id,
    risk_description: rows[index].risk_description,
    risk_level: rows[index].risk_level,
    action_owner: rows[index].action_owner,
  });

  return {
    scanned: rows.length,
    compared,
    matched: scored.length,
    truncated: pairCapHit || rows.length >= MAX_DUPLICATE_SCAN,
    candidates: scored.slice(0, MAX_DUPLICATE_RESULTS).map(({ a, b, similarity, shared }) => ({
      vendor: { id: rows[a].vendor_id!, name: rows[a].vendor_name },
      risk_a: ref(a),
      risk_b: ref(b),
      similarity: Math.round(similarity * 100) / 100,
      shared_tokens: shared,
    })),
  };
}

// ---------------------------------------------------------------------------
// Framework coverage
// ---------------------------------------------------------------------------

export const MAX_VENDOR_COVERAGE_ROWS = 500; // per list

export type VendorCoverageState = "mapped" | "gap" | "no_framework";

export interface VendorCoverageRisk {
  id: number;
  risk_description: string | null;
  risk_level: string | null;
  action_owner: number | null;
  vendor: { id: number | null; name: string | null };
  /** What it could be mapped to: frameworks on the use cases the vendor serves. */
  available_frameworks: string[];
}

export interface VendorCoverageReport {
  summary: { total_active_risks: number; mapped: number; gap: number; no_framework: number };
  gaps: VendorCoverageRisk[];
  no_framework: VendorCoverageRisk[];
  truncated: boolean;
}

/**
 * F8's three-state rule, for vendor risks. A mapped risk is covered. An
 * unmapped risk whose vendor serves a use case with a framework attached is a
 * gap: there was something to map to and nobody did. Otherwise there is
 * nothing to map to yet, which is not a finding.
 */
export function vendorCoverageState(row: VendorCoverageScanRow): VendorCoverageState {
  if (row.mapped_frameworks.length > 0) return "mapped";
  if (row.available_frameworks.length > 0) return "gap";
  return "no_framework";
}

/** Vendor risk levels are free-text-ish ("High", "Very high risk"); rank by word. */
export function vendorRiskLevelRank(level: string | null): number {
  const value = (level ?? "").toLowerCase();
  if (value.includes("very high") || value.includes("critical")) return 5;
  if (value.includes("high")) return 4;
  if (value.includes("medium") || value.includes("moderate")) return 3;
  if (value.includes("very low")) return 1;
  if (value.includes("low")) return 2;
  return 0;
}

export async function findVendorFrameworkCoverage(
  organizationId: number,
): Promise<VendorCoverageReport> {
  const rows = await getVendorCoverageScanRowsQuery(organizationId);

  const gaps: VendorCoverageRisk[] = [];
  const noFramework: VendorCoverageRisk[] = [];
  let mapped = 0;
  for (const row of rows) {
    const state = vendorCoverageState(row);
    if (state === "mapped") {
      mapped += 1;
      continue;
    }
    const risk: VendorCoverageRisk = {
      id: row.id,
      risk_description: row.risk_description,
      risk_level: row.risk_level,
      action_owner: row.action_owner,
      vendor: { id: row.vendor_id, name: row.vendor_name },
      available_frameworks: row.available_frameworks,
    };
    (state === "gap" ? gaps : noFramework).push(risk);
  }

  const worstFirst = (a: VendorCoverageRisk, b: VendorCoverageRisk) =>
    vendorRiskLevelRank(b.risk_level) - vendorRiskLevelRank(a.risk_level) || a.id - b.id;
  gaps.sort(worstFirst);
  noFramework.sort(worstFirst);

  return {
    summary: {
      total_active_risks: rows.length,
      mapped,
      gap: gaps.length,
      no_framework: noFramework.length,
    },
    gaps: gaps.slice(0, MAX_VENDOR_COVERAGE_ROWS),
    no_framework: noFramework.slice(0, MAX_VENDOR_COVERAGE_ROWS),
    truncated:
      gaps.length > MAX_VENDOR_COVERAGE_ROWS || noFramework.length > MAX_VENDOR_COVERAGE_ROWS,
  };
}
