/**
 * @fileoverview Deterministic OSFI E-23 fix-it list (spec 8.6). A pure function
 * over the requirement rows, the fired contradiction rules and the MRM model
 * facts; the AI never ranks or edits it.
 *
 * @module services/reporting/e23/fixItList
 */

import type {
  E23ContradictionsSectionData,
  E23FixItItem,
  E23FixItListSectionData,
  FrameworkRequirementRow,
  FrameworkRequirementsSectionData,
  MrmModelFacts,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import type { Status } from "../../../types/status.type";
import { hasNoActiveOwner } from "../collectors/frameworkRollup";
import type { E23RuleId } from "./contradictionRules";
import { FIX_IT_CLOSES_WHEN } from "./e23Text";
import { isCriticalOrHigh, isOpenFinding, isValidationOverdue, time } from "./mrmFleet";

const E23_FRAMEWORK_ID = 26;
const UNASSIGNED = "Unassigned";
// Typed against the shared status list, so a rename fails the typecheck.
const NEEDS_REWORK: Status = "Needs rework";
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

const flatten = (rows: FrameworkRequirementRow[]): FrameworkRequirementRow[] =>
  rows.flatMap((r) => [r, ...flatten(r.children ?? [])]);

const ownerOf = (owner: string | null): string =>
  hasNoActiveOwner(owner) ? UNASSIGNED : (owner as string);

/** First matching source in order 3, 2, 4, 5, 6; null when the row needs nothing. */
function requirementItem(row: FrameworkRequirementRow): E23FixItItem | null {
  const base = {
    where: row.title.trim(),
    owner: ownerOf(row.owner),
    dueDate: row.dueDate,
    overdue: row.isOverdue,
    sortKey: row.orderNo,
  };
  if (!row.isDone && row.isOverdue) {
    return {
      ...base,
      severity: "high",
      source: 3,
      what: `Past its due date and not done (status: ${row.status})`,
      closesWhen: FIX_IT_CLOSES_WHEN["3"],
    };
  }
  if (!row.isDone && hasNoActiveOwner(row.owner)) {
    return {
      ...base,
      severity: "medium",
      source: 2,
      what: `Not done and has no owner (status: ${row.status})`,
      closesWhen: FIX_IT_CLOSES_WHEN["2"],
    };
  }
  if (row.status === NEEDS_REWORK) {
    return {
      ...base,
      severity: "medium",
      source: 4,
      what: "Marked as needing rework",
      closesWhen: FIX_IT_CLOSES_WHEN["4"],
    };
  }
  if (row.isDone && row.evidenceCount === 0) {
    return {
      ...base,
      severity: "medium",
      source: 5,
      what: `Marked ${row.status} with no evidence attached`,
      closesWhen: FIX_IT_CLOSES_WHEN["5"],
    };
  }
  if (!row.isDone) {
    return {
      ...base,
      severity: "low",
      source: 6,
      what: `Not done (status: ${row.status})`,
      closesWhen: FIX_IT_CLOSES_WHEN["6"],
    };
  }
  return null;
}

function modelItem(m: MrmModelFacts, generatedAt: Date): E23FixItItem | null {
  const now = generatedAt.getTime();
  const openCriticalHigh = m.findings.filter((f) => isOpenFinding(f) && isCriticalOrHigh(f));
  const validationOverdue = isValidationOverdue(m, generatedAt);

  const gaps: string[] = [];
  if (!m.tier) gaps.push("Untiered");
  if (validationOverdue) gaps.push("Overdue validation");
  if (m.roles.owner.length === 0) gaps.push("No owner role");
  if (m.roles.approver.length === 0 && m.inventoryApproverId == null) gaps.push("No approver");
  if ((m.tier === "1" || m.tier === "2") && m.activeThresholds === 0) {
    gaps.push("No active threshold");
  }
  if (openCriticalHigh.length > 0) gaps.push("Open critical or high finding");
  if (gaps.length === 0) return null;

  const findingDues = openCriticalHigh
    .map((f) => time(f.dueDate))
    .filter((t): t is number => t !== null);
  const validationDue = validationOverdue ? time(m.openValidationNextDue) : null;
  const earliestFinding = findingDues.length > 0 ? Math.min(...findingDues) : null;

  let dueDate: string | null = null;
  if (earliestFinding !== null) {
    dueDate = openCriticalHigh.find((f) => time(f.dueDate) === earliestFinding)?.dueDate ?? null;
  } else if (validationDue !== null) {
    dueDate = m.openValidationNextDue;
  }
  const overdue =
    (earliestFinding !== null && earliestFinding < now) ||
    (validationDue !== null && validationDue < now);

  return {
    severity: m.tier === "1" || openCriticalHigh.length > 0 ? "high" : "medium",
    source: 7,
    what: gaps.join("; "),
    where: m.name,
    owner: m.roles.owner[0] ?? UNASSIGNED,
    dueDate,
    overdue,
    closesWhen: FIX_IT_CLOSES_WHEN["7"],
    sortKey: 0,
  };
}

export function buildE23FixItList(input: {
  requirements: FrameworkRequirementsSectionData | undefined;
  contradictions: E23ContradictionsSectionData;
  models: MrmModelFacts[];
  generatedAt: Date;
}): E23FixItListSectionData {
  const rows = (input.requirements?.frameworks ?? [])
    .filter((f) => f.frameworkId === E23_FRAMEWORK_ID)
    .flatMap((f) => f.groups.flatMap((g) => flatten(g.requirements)));

  const items: E23FixItItem[] = [];

  for (const rule of input.contradictions.fired) {
    const title = rule.requirementTitle.trim();
    const matched =
      rows.find((r) => r.title.trim() === title && r.isDone) ??
      rows.find((r) => r.title.trim() === title);
    items.push({
      severity: "high",
      source: 1,
      what: rule.finding,
      where: title,
      owner: matched ? ownerOf(matched.owner) : UNASSIGNED,
      dueDate: null,
      overdue: false,
      closesWhen: FIX_IT_CLOSES_WHEN[rule.ruleId as E23RuleId],
      sortKey: 0,
    });
  }

  for (const row of rows) {
    const item = requirementItem(row);
    if (item) items.push(item);
  }

  for (const m of input.models.filter((x) => !x.retired)) {
    const item = modelItem(m, input.generatedAt);
    if (item) items.push(item);
  }

  items.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      Number(b.overdue) - Number(a.overdue) ||
      a.sortKey - b.sortKey ||
      a.where.localeCompare(b.where),
  );

  const counts = { high: 0, medium: 0, low: 0 };
  for (const i of items) counts[i.severity] += 1;
  return { items, counts };
}
