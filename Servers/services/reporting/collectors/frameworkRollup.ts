/**
 * @fileoverview Rollup arithmetic for the frameworkRequirements section.
 *
 * Shared by the collector (per group) and the merge (pooled framework), so a
 * pooled rollup is always re-derived from requirement rows and never from
 * summed or averaged percentages.
 *
 * @module services/reporting/collectors/frameworkRollup
 */

import type {
  FrameworkRequirementGroup,
  FrameworkRequirementRollup,
  FrameworkRequirementRow,
} from "../../../domain.layer/interfaces/i.reportGeneration";

export const emptyRollup = (): FrameworkRequirementRollup => ({
  total: 0,
  done: 0,
  unassigned: 0,
  noEvidence: 0,
  overdue: 0,
  statusBreakdown: {},
});

export const addRow = (rollup: FrameworkRequirementRollup, row: FrameworkRequirementRow) => {
  rollup.total += 1;
  if (row.isDone) rollup.done += 1;
  if (row.owner === null) rollup.unassigned += 1;
  if (row.evidenceCount === 0) rollup.noEvidence += 1;
  if (row.isOverdue) rollup.overdue += 1;
  rollup.statusBreakdown[row.status] = (rollup.statusBreakdown[row.status] ?? 0) + 1;
};

/** Counts every L2 requirement and its L3 children across the given groups. */
export const rollupFromGroups = (
  groups: FrameworkRequirementGroup[],
): FrameworkRequirementRollup => {
  const rollup = emptyRollup();
  for (const g of groups) {
    for (const row of g.requirements) {
      addRow(rollup, row);
      for (const c of row.children ?? []) addRow(rollup, c);
    }
  }
  return rollup;
};
