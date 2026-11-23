/**
 * @fileoverview The fixed "at a glance" figures of the OSFI E-23 report
 * (spec 8.3 item 3) and their stored form for the next run's comparison
 * (spec 8.10). No AI: every figure is read off a section built in the same run.
 *
 * @module services/reporting/e23/glance
 */

import type {
  E23ContradictionsSectionData,
  E23FixItListSectionData,
  E23Glance,
  E23GlanceAvailability,
  E23GlanceFigures,
  E23GlancePrevious,
  E23GlanceSnapshot,
  FrameworkRequirementsSectionData,
  MrmFleetSectionData,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { E23_RULES, e23RowsByNumber } from "./contradictionRules";
import { E23_FRAMEWORK_ID } from "./e23Parameters";

const NUMERIC_FIELDS = [
  "requirementsDone",
  "requirementsTotal",
  "groupsChecked",
  "groupsTotal",
  "rulesFired",
  "rulesTotal",
  "modelsInScope",
  "untiered",
  "overdueValidations",
  "openCriticalHigh",
] as const;

const SEVERITIES = ["high", "medium", "low"] as const;

const pickFigures = (g: E23GlanceFigures): E23GlanceFigures => ({
  requirementsDone: g.requirementsDone,
  requirementsTotal: g.requirementsTotal,
  groupsChecked: g.groupsChecked,
  groupsTotal: g.groupsTotal,
  rulesFired: g.rulesFired,
  rulesTotal: g.rulesTotal,
  modelsInScope: g.modelsInScope,
  untiered: g.untiered,
  overdueValidations: g.overdueValidations,
  openCriticalHigh: g.openCriticalHigh,
  fixIt: { high: g.fixIt.high, medium: g.fixIt.medium, low: g.fixIt.low },
});

/**
 * The E-23 requirements done and in total. A requirement counts once however
 * many pairings carry E-23, and is done only when every pairing's row for it
 * is done. The glance and the formal report's completeness line both print
 * these, so the report never states two different counts.
 */
export function e23RequirementCounts(requirements: FrameworkRequirementsSectionData | undefined): {
  done: number;
  total: number;
} {
  const byNumber = [...e23RowsByNumber(requirements).values()];
  return {
    done: byNumber.filter((rows) => rows.every((p) => p.row.isDone)).length,
    total: byNumber.length,
  };
}

export function buildE23Glance(input: {
  requirements: FrameworkRequirementsSectionData | undefined;
  contradictions: E23ContradictionsSectionData | undefined;
  fleet: MrmFleetSectionData | undefined;
  fixIt: E23FixItListSectionData | undefined;
  /** The MRM data could not be read; model, rule and fix-it figures are 0. */
  mrmUnavailable?: boolean;
  /** Already parsed (parseStoredE23Glance), or null. */
  previous: E23GlanceSnapshot | null;
}): E23Glance {
  const e23 = (input.requirements?.frameworks ?? []).filter(
    (f) => f.frameworkId === E23_FRAMEWORK_ID,
  );
  const coverage = Object.values(input.contradictions?.coverage ?? {});
  const findings = input.fleet?.openFindingsBySeverity;
  // The collector hands over requirements only when every E-23 pairing was
  // read, so "any E-23 entry" is the same test as contradictions.available.
  const availability: E23GlanceAvailability = {
    requirementsAvailable: e23.length > 0,
    ...(input.mrmUnavailable && { mrmUnavailable: true }),
  };

  const requirementCounts = e23RequirementCounts(input.requirements);

  return {
    requirementsDone: requirementCounts.done,
    requirementsTotal: requirementCounts.total,
    groupsChecked: coverage.filter((c) => c === "checked").length,
    groupsTotal: coverage.length,
    rulesFired: input.contradictions?.fired.length ?? 0,
    rulesTotal: E23_RULES.length,
    modelsInScope: input.fleet?.totals.models ?? 0,
    untiered: input.fleet?.totals.untiered ?? 0,
    overdueValidations: input.fleet?.validationCoverage.overdue ?? 0,
    openCriticalHigh: (findings?.critical ?? 0) + (findings?.high ?? 0),
    fixIt: {
      high: input.fixIt?.counts.high ?? 0,
      medium: input.fixIt?.counts.medium ?? 0,
      low: input.fixIt?.counts.low ?? 0,
    },
    ...availability,
    previous: input.previous ? comparable(input.previous, availability) : null,
  };
}

/**
 * The previous run's figures, with every figure that was unavailable in
 * either run set to null, so no change is shown against a 0 that was never
 * measured. Groups follow E23GlanceAvailability.
 */
function comparable(prev: E23GlanceSnapshot, now: E23GlanceAvailability): E23GlancePrevious {
  const requirements = prev.requirementsAvailable && now.requirementsAvailable;
  const mrm = !prev.mrmUnavailable && !now.mrmUnavailable;
  const rules = requirements && mrm;
  const keep = (ok: boolean, v: number) => (ok ? v : null);
  return {
    requirementsDone: keep(requirements, prev.requirementsDone),
    requirementsTotal: keep(requirements, prev.requirementsTotal),
    groupsChecked: keep(rules, prev.groupsChecked),
    groupsTotal: keep(rules, prev.groupsTotal),
    rulesFired: keep(rules, prev.rulesFired),
    rulesTotal: prev.rulesTotal,
    modelsInScope: keep(mrm, prev.modelsInScope),
    untiered: keep(mrm, prev.untiered),
    overdueValidations: keep(mrm, prev.overdueValidations),
    openCriticalHigh: keep(mrm, prev.openCriticalHigh),
    fixIt: rules ? { ...prev.fixIt } : null,
    generatedAt: prev.generatedAt,
  };
}

/** What a run stores in config_snapshot.e23_glance: the figures, never `previous`. */
export function toE23GlanceSnapshot(glance: E23Glance, generatedAt: Date): E23GlanceSnapshot {
  return {
    ...pickFigures(glance),
    generatedAt: generatedAt.toISOString(),
    requirementsAvailable: glance.requirementsAvailable,
    ...(glance.mrmUnavailable && { mrmUnavailable: true }),
  };
}

const roundedNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

/**
 * Reads a stored glance back. The JSONB is not trusted to have the current
 * shape: anything missing or non-numeric yields null (no comparison) rather
 * than a change block built on a wrong number.
 */
export function parseStoredE23Glance(value: unknown): E23GlanceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== "string") return null;
  const fixItRaw = v.fixIt as Record<string, unknown> | undefined;
  if (!fixItRaw || typeof fixItRaw !== "object") return null;

  const figures: Record<string, number> = {};
  for (const key of NUMERIC_FIELDS) {
    const n = roundedNumber(v[key]);
    if (n === null) return null;
    figures[key] = n;
  }
  const fixIt: Record<string, number> = {};
  for (const key of SEVERITIES) {
    const n = roundedNumber(fixItRaw[key]);
    if (n === null) return null;
    fixIt[key] = n;
  }

  return {
    ...(figures as Omit<E23GlanceFigures, "fixIt">),
    fixIt: fixIt as E23GlanceFigures["fixIt"],
    generatedAt: v.generatedAt,
    // Snapshots stored before the flag existed came from runs that read it.
    requirementsAvailable: v.requirementsAvailable !== false,
    ...(v.mrmUnavailable === true && { mrmUnavailable: true }),
  };
}
