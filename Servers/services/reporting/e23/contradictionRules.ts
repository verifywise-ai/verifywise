/**
 * @fileoverview Fixed OSFI E-23 contradiction rules (spec 8.4): where the
 * self-assessed E-23 checklist says a requirement is done but the MRM data
 * says otherwise. One pure function over collected data, so results are
 * reproducible and unit-testable.
 *
 * A rule is checked when its requirement number matches an E-23 row (title
 * text before the first space). It fires when any matched row is done
 * (Implemented or Audited) and the data condition holds for at least one
 * non-retired model (C1: when there are none).
 *
 * @module services/reporting/e23/contradictionRules
 */

import { MrmTier } from "../../../domain.layer/enums/mrm.enum";
import type {
  E23ContradictionsSectionData,
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
  MrmModelFacts,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { computeNextReviewDue, REVALIDATION_CADENCE_MONTHS } from "../../../utils/mrm.utils";
import {
  hasRecentMetric,
  isCriticalOrHigh,
  isOpenFinding,
  isValidationOverdue,
  METRIC_STALE_DAYS,
  time,
} from "./mrmFleet";

const E23_FRAMEWORK_ID = 26;
const MAX_EXAMPLES = 5;

export type E23RuleId =
  "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "C10" | "C11" | "C12" | "C13";

export interface E23Rule {
  id: E23RuleId;
  /** Requirement number, the title prefix in the E-23 structure ("2.1.4"). */
  requirement: string;
  /** Requirement title after the number, as in the structure. */
  description: string;
  /** Plain-English data condition (spec 8.4 table). */
  dataCondition: string;
}

const cadence = `tier 1 ${REVALIDATION_CADENCE_MONTHS[MrmTier.TIER_1]} months, tier 2 ${
  REVALIDATION_CADENCE_MONTHS[MrmTier.TIER_2]
}, tier 3 ${REVALIDATION_CADENCE_MONTHS[MrmTier.TIER_3]}`;

export const E23_RULES: readonly E23Rule[] = [
  {
    id: "C1",
    requirement: "2.1.4",
    description: "Enterprise-level model inventory as system of record",
    dataCondition: "No models in the inventory",
  },
  {
    id: "C2",
    requirement: "2.2.3",
    description: "Every model rated through a defined process",
    dataCondition: "Any model with no MRM tier",
  },
  {
    id: "C3",
    requirement: "2.2.4",
    description: "Regular and trigger-based rating review",
    dataCondition: `Any tiered model whose rating was last set or affirmed (the later of its tiering date and its latest validation sign-off, since sign-off affirms the tier) longer ago than its tier's review cadence (${cadence}), or flagged for revalidation with no open validation`,
  },
  {
    id: "C4",
    requirement: "3.1.3",
    description: "Explicit stakeholder responsibilities",
    dataCondition: "Any model with no owner MRM role",
  },
  {
    id: "C5",
    requirement: "3.4.1",
    description: "Review independent of development",
    dataCondition:
      "Any model whose latest validation's validator currently also holds the developer role on that model (latest only: role history is not kept, so older validations cannot be judged fairly)",
  },
  {
    id: "C6",
    requirement: "3.4.2",
    description: "Review depth and frequency set by rating",
    dataCondition:
      "Any model with an overdue validation (due date before generation, not validated)",
  },
  {
    id: "C7",
    requirement: "3.4.6",
    description: "Documented results and recommendation to the approver",
    dataCondition:
      "Any model whose latest signed-off validation has one or more of its six report sections (purpose and scope, conceptual soundness, data review, outcomes analysis, findings and limitations, conclusion and sign-off) missing or empty",
  },
  {
    id: "C8",
    requirement: "3.4.7",
    description: "Suitability approval throughout the lifecycle",
    dataCondition: "Any model with neither an approver MRM role nor an inventory approver",
  },
  {
    id: "C9",
    requirement: "3.4.9",
    description: "Approval with known limitations backed by mitigants or justification",
    dataCondition:
      "Any Approved model with a critical or high finding still at stage open and with an empty remediation plan (E-23 allows approval with known limitations when mitigants exist, so a planned or in-progress remediation does not fire)",
  },
  {
    id: "C10",
    requirement: "3.6.4",
    description: "Breach thresholds and material-modification criteria",
    dataCondition: "Any tier 1 or tier 2 model with no active threshold",
  },
  {
    id: "C11",
    requirement: "3.6.1",
    description: "Monitoring standards by rating and model type",
    dataCondition: `Any model with active thresholds but no metric received in the last ${METRIC_STALE_DAYS} days`,
  },
  {
    id: "C12",
    requirement: "2.2.8",
    description: "Remediation when model risk exceeds appetite",
    dataCondition: "Any open critical or high finding past its due date",
  },
  {
    id: "C13",
    requirement: "3.4.7",
    description: "Suitability approval throughout the lifecycle",
    dataCondition: "Any Approved model whose latest signed-off validation outcome is not validated",
  },
];

/**
 * Later of the tiering date and the latest sign-off (sign-off affirms the tier,
 * E-23 3.4.8). null when neither is known: the rating was never set through the
 * process, which C3 treats as stale.
 */
const lastAffirmed = (m: MrmModelFacts): number | null => {
  const times = [time(m.tieredAt), time(m.latestSignedOff?.signedOffAt)].filter(
    (t): t is number => t !== null,
  );
  return times.length > 0 ? Math.max(...times) : null;
};

const isRatingStale = (m: MrmModelFacts, generatedAt: Date): boolean => {
  if (!m.tier) return false;
  if (m.revalidationFlagged && !m.hasOpenValidation) return true;
  const affirmed = lastAffirmed(m);
  if (affirmed === null) return true;
  const due = computeNextReviewDue(m.tier, new Date(affirmed));
  return due !== null && due.getTime() < generatedAt.getTime();
};

type Condition = (m: MrmModelFacts, generatedAt: Date) => boolean;

/** Per-model conditions; C1 is fleet-level and handled separately. */
const CONDITIONS: Record<Exclude<E23RuleId, "C1">, Condition> = {
  C2: (m) => m.tier === null,
  C3: isRatingStale,
  C4: (m) => m.roles.owner.length === 0,
  C5: (m) => {
    const validatorId = m.latestSignedOff?.validatorId;
    return validatorId != null && m.roles.developerIds.includes(validatorId);
  },
  C6: isValidationOverdue,
  C7: (m) => (m.latestSignedOff?.emptyReportSections.length ?? 0) > 0,
  C8: (m) => m.roles.approver.length === 0 && m.inventoryApproverId == null,
  C9: (m) =>
    m.status === "Approved" &&
    m.findings.some((f) => isCriticalOrHigh(f) && f.stage === "open" && f.remediationPlanEmpty),
  C10: (m) => (m.tier === "1" || m.tier === "2") && m.activeThresholds === 0,
  C11: (m, generatedAt) => m.activeThresholds > 0 && !hasRecentMetric(m, generatedAt),
  C12: (m, generatedAt) =>
    m.findings.some((f) => {
      const due = time(f.dueDate);
      return isOpenFinding(f) && isCriticalOrHigh(f) && due !== null && due < generatedAt.getTime();
    }),
  C13: (m) => m.status === "Approved" && m.latestSignedOff?.outcome === "not_validated",
};

const modelCount = (n: number) => (n === 1 ? "1 model" : `${n} models`);
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** One plain-English sentence per fired rule, from its condition and count. */
const FINDING_TEMPLATES: Record<Exclude<E23RuleId, "C1">, (n: number) => string> = {
  C2: (n) => `${modelCount(n)} ${verb(n, "has", "have")} no MRM tier`,
  C3: (n) =>
    `${modelCount(n)} ${verb(n, "has a", "have a")} rating past its review cadence or awaiting revalidation`,
  C4: (n) => `${modelCount(n)} ${verb(n, "has", "have")} no owner role`,
  C5: (n) =>
    `${modelCount(n)} whose latest validation was signed off by someone who also holds the developer role`,
  C6: (n) => `${modelCount(n)} ${verb(n, "has an", "have an")} overdue validation`,
  C7: (n) =>
    `${modelCount(n)} ${verb(n, "has a", "have a")} latest signed-off validation report with missing or empty sections`,
  C8: (n) => `${modelCount(n)} ${verb(n, "has", "have")} no approver`,
  C9: (n) =>
    `${modelCount(n)} ${verb(n, "is", "are")} approved with an open critical or high finding and no remediation plan`,
  C10: (n) => `${modelCount(n)} in tier 1 or 2 ${verb(n, "has", "have")} no active threshold`,
  C11: (n) =>
    `${modelCount(n)} with active thresholds received no metric in the last ${METRIC_STALE_DAYS} days`,
  C12: (n) =>
    `${modelCount(n)} ${verb(n, "has an", "have an")} open critical or high finding past its due date`,
  C13: (n) =>
    `${modelCount(n)} ${verb(n, "is", "are")} approved although the latest validation outcome is 'Not validated'`,
};

const requirementNumber = (title: string): string => title.trim().split(/\s+/)[0] ?? "";

const flattenRows = (rows: FrameworkRequirementRow[]): FrameworkRequirementRow[] =>
  rows.flatMap((r) => [r, ...flattenRows(r.children ?? [])]);

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

export function evaluateE23Rules(input: {
  requirements: FrameworkRequirementsSectionData | undefined;
  models: MrmModelFacts[];
  generatedAt: Date;
}): E23ContradictionsSectionData {
  const { requirements, generatedAt } = input;
  const frameworks = (requirements?.frameworks ?? []).filter(
    (f) => f.frameworkId === E23_FRAMEWORK_ID,
  );
  if (frameworks.length === 0) {
    return { available: false, fired: [], checked: [], notRun: [], coverage: {} };
  }

  // Groups in section order; several pairings repeat a title, which maps to one key.
  const groups = frameworks.flatMap((f) => f.groups);
  const rowsByNumber = new Map<string, FrameworkRequirementRow[]>();
  const groupsByNumber = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const row of flattenRows(group.requirements)) {
      const number = requirementNumber(row.title);
      rowsByNumber.set(number, [...(rowsByNumber.get(number) ?? []), row]);
      groupsByNumber.set(number, (groupsByNumber.get(number) ?? new Set()).add(group.title));
    }
  }

  const live = input.models.filter((m) => !m.retired);
  const result: E23ContradictionsSectionData = {
    available: true,
    fired: [],
    checked: [],
    notRun: [],
    coverage: {},
  };
  const checkedGroups = new Set<string>();

  for (const rule of E23_RULES) {
    const matched = rowsByNumber.get(rule.requirement) ?? [];
    if (matched.length === 0) {
      result.notRun.push({
        ruleId: rule.id,
        requirement: rule.requirement,
        reason: `requirement ${rule.requirement} not found in this organization's E-23 checklist`,
      });
      continue;
    }
    result.checked.push(rule.id);
    groupsByNumber.get(rule.requirement)?.forEach((title) => checkedGroups.add(title));

    const claimed = matched.find((r) => r.isDone);
    if (!claimed) continue;

    const base = {
      ruleId: rule.id,
      requirement: rule.requirement,
      requirementTitle: claimed.title,
      claimedStatus: claimed.status,
    };

    if (rule.id === "C1") {
      if (live.length === 0) {
        result.fired.push({
          ...base,
          finding: "No models in the inventory",
          affectedCount: 0,
          examples: [],
          moreCount: 0,
        });
      }
      continue;
    }

    const affected = live
      .filter((m) => CONDITIONS[rule.id as Exclude<E23RuleId, "C1">](m, generatedAt))
      .map((m) => m.name)
      .sort(byName);
    if (affected.length === 0) continue;

    result.fired.push({
      ...base,
      finding: FINDING_TEMPLATES[rule.id as Exclude<E23RuleId, "C1">](affected.length),
      affectedCount: affected.length,
      examples: affected.slice(0, MAX_EXAMPLES),
      moreCount: Math.max(0, affected.length - MAX_EXAMPLES),
    });
  }

  for (const group of groups) {
    result.coverage[group.title] = checkedGroups.has(group.title)
      ? "checked"
      : "selfAssessmentOnly";
  }
  return result;
}
