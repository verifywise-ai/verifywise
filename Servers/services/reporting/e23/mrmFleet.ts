/**
 * @fileoverview Model risk management status and inventory appendix for the
 * OSFI E-23 report. Pure functions over the facts from collectMrmModelFacts.
 *
 * Unlike getAttestationSummary (the MRM tab), every count here excludes
 * retired models and no per-tier verdict is produced, so this section agrees
 * with the contradiction rules and the fix-it list.
 *
 * @module services/reporting/e23/mrmFleet
 */

import type {
  MrmActivity,
  MrmFleetSectionData,
  MrmInventoryAppendixRow,
  MrmInventoryAppendixSectionData,
  MrmModelFacts,
  MrmTierValue,
} from "../../../domain.layer/interfaces/i.reportGeneration";

/** A model with active thresholds but no metric received within this many days is stale. */
export const METRIC_STALE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const TIERS: readonly MrmTierValue[] = ["1", "2", "3"];
type Severity = keyof MrmFleetSectionData["openFindingsBySeverity"];
const SEVERITIES = new Set<string>(["critical", "high", "medium", "low"]);
const LIMITATIONS_MAX = 300;

/** ISO timestamp to epoch ms; null when missing or unparseable. */
export const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

export const isOpenFinding = (f: MrmModelFacts["findings"][number]): boolean =>
  f.stage !== "closed";

export const isCriticalOrHigh = (f: MrmModelFacts["findings"][number]): boolean =>
  f.severity === "critical" || f.severity === "high";

/**
 * An open validation whose next due date is strictly before generation.
 * Strict `<` is intentional (spec 8.4 C6: "next_due before generation"); the
 * MRM tab (mrmAttestation.utils.ts) uses `<=`, so a due time equal to the
 * generation instant counts as overdue there but not here.
 */
export const isValidationOverdue = (m: MrmModelFacts, generatedAt: Date): boolean => {
  const due = time(m.openValidationNextDue);
  return m.hasOpenValidation && due !== null && due < generatedAt.getTime();
};

/** A metric received within METRIC_STALE_DAYS of generation (inclusive). */
export const hasRecentMetric = (m: MrmModelFacts, generatedAt: Date): boolean => {
  const at = time(m.lastMetricReceivedAt);
  return at !== null && generatedAt.getTime() - at <= METRIC_STALE_DAYS * DAY_MS;
};

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function buildMrmFleet(
  models: MrmModelFacts[],
  activity: MrmActivity,
  generatedAt: Date,
): MrmFleetSectionData {
  const live = models.filter((m) => !m.retired);

  const byTier: Record<MrmTierValue, number> = { "1": 0, "2": 0, "3": 0 };
  const validationCoverage = { validated: 0, inReview: 0, notStarted: 0, overdue: 0 };
  const openFindingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const monitoring = { withActiveThresholds: 0, withRecentMetric: 0 };
  const perTier = TIERS.map((tier) => ({
    tier,
    models: 0,
    tieringCurrent: 0,
    validated: 0,
    monitoringActive: 0,
    openFindings: 0,
    criticalHighFindings: 0,
    openBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
  }));
  const exceptions: MrmFleetSectionData["exceptions"] = [];
  let untiered = 0;

  for (const m of live) {
    const validated = !!m.latestSignedOff?.outcome;
    const overdue = isValidationOverdue(m, generatedAt);
    const open = m.findings.filter(isOpenFinding);
    const criticalHigh = open.filter(isCriticalOrHigh);

    if (m.tier) byTier[m.tier] += 1;
    else untiered += 1;

    // Exactly one row per model, so the rows add up to the models in scope:
    // an overdue validation first, then one in progress (a first validation
    // or a revalidation), then a signed-off validation with no validation open.
    if (overdue) validationCoverage.overdue += 1;
    else if (m.hasOpenValidation) validationCoverage.inReview += 1;
    else if (validated) validationCoverage.validated += 1;
    else validationCoverage.notStarted += 1;

    for (const f of open) {
      if (SEVERITIES.has(f.severity)) openFindingsBySeverity[f.severity as Severity] += 1;
    }

    if (m.activeThresholds > 0) monitoring.withActiveThresholds += 1;
    if (hasRecentMetric(m, generatedAt)) monitoring.withRecentMetric += 1;

    const row = perTier.find((t) => t.tier === m.tier);
    if (row) {
      row.models += 1;
      if (m.tieredAt) row.tieringCurrent += 1;
      if (validated) row.validated += 1;
      if (m.activeThresholds > 0) row.monitoringActive += 1;
      row.openFindings += open.length;
      row.criticalHighFindings += criticalHigh.length;
      for (const f of open) {
        if (SEVERITIES.has(f.severity)) row.openBySeverity[f.severity as Severity] += 1;
      }
    }

    const issues: string[] = [];
    if (!m.tier) issues.push("Untiered");
    if (overdue) issues.push("Overdue validation");
    if (m.roles.owner.length === 0) issues.push("No owner role");
    if (criticalHigh.length > 0) issues.push("Open critical or high finding");
    if (issues.length > 0) exceptions.push({ name: m.name, tier: m.tier, issues });
  }

  return {
    totals: { models: live.length, untiered, byTier },
    validationCoverage,
    openFindingsBySeverity,
    monitoring,
    activity,
    perTier,
    exceptions: exceptions.sort(byName),
  };
}

const truncate = (text: string | null): string | null =>
  text && text.length > LIMITATIONS_MAX ? `${text.slice(0, LIMITATIONS_MAX)}…` : text;

const joinNames = (names: string[]): string | null =>
  names.length > 0 ? [...new Set(names)].join(", ") : null;

const toRow = (m: MrmModelFacts): MrmInventoryAppendixRow => ({
  name: m.name,
  version: m.version,
  provider: m.provider,
  type: m.type,
  tier: m.tier,
  status: m.status,
  owner: joinNames(m.roles.owner),
  // The MRM approver role is the governance record; the legacy inventory
  // approver column is shown only when no role is assigned.
  approver: joinNames(m.roles.approver) ?? m.inventoryApprover,
  intendedUse: m.intendedUse,
  limitations: truncate(m.limitations),
  latestOutcome: m.latestSignedOff?.outcome ?? null,
  latestSignedOffAt: m.latestSignedOff?.signedOffAt ?? null,
  nextReviewDue: m.nextReviewDue,
  activeThresholds: m.activeThresholds > 0,
  openFindings: m.findings.filter(isOpenFinding).length,
});

export function buildInventoryAppendix(models: MrmModelFacts[]): MrmInventoryAppendixSectionData {
  const rows = models.map((m) => ({ retired: m.retired, row: toRow(m) }));
  return {
    active: rows
      .filter((r) => !r.retired)
      .map((r) => r.row)
      .sort(byName),
    retired: rows
      .filter((r) => r.retired)
      .map((r) => r.row)
      .sort(byName),
  };
}
