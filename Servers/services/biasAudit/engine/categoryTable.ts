import { groupValue } from "./groupValue";
import { applyImpactRatios } from "./impactRatios";
import { round6 } from "./round";
import type { AuditRecord, CategoryTable, GroupResult } from "./types";

export interface CategoryTableArgs {
  records: AuditRecord[];
  categoryKey: string;
  categoryLabel: string;
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
  rateOf: (record: AuditRecord) => boolean;
  titlePrefix?: string;
}

/**
 * Rates and impact ratios for one protected category.
 *
 * Ported from EvalServer's `_compute_category_table`. Behaviour preserved
 * deliberately, including two properties a caller must handle rather than
 * assume away:
 *
 *  - a record whose group name is blank is skipped, so the counted total can
 *    be far below the record count (see dataGates.ts);
 *  - when the highest rate is 0, every impact ratio is null.
 */
export function computeCategoryTable(args: CategoryTableArgs): CategoryTable {
  const {
    records,
    categoryKey,
    categoryLabel,
    totalApplicants,
    threshold,
    smallSampleExclusion,
    rateOf,
    titlePrefix = "Impact ratios",
  } = args;

  const groups = new Map<string, { applicants: number; selected: number }>();
  for (const record of records) {
    const name = groupValue(record, categoryKey);
    if (name === null) continue;
    const entry = groups.get(name) ?? { applicants: 0, selected: 0 };
    entry.applicants += 1;
    if (rateOf(record)) entry.selected += 1;
    groups.set(name, entry);
  }

  const rows: GroupResult[] = [];
  let highestRate = 0;
  let highestGroup = "";

  for (const groupName of [...groups.keys()].sort()) {
    const { applicants, selected } = groups.get(groupName)!;
    const rate = applicants > 0 ? selected / applicants : 0;
    if (rate > highestRate) {
      highestRate = rate;
      highestGroup = groupName;
    }
    rows.push({
      categoryType: categoryKey,
      categoryName: groupName,
      applicantCount: applicants,
      selectedCount: selected,
      selectionRate: round6(rate),
      impactRatio: null,
      excluded: false,
      flagged: false,
    });
  }

  applyImpactRatios(rows, { highestRate, totalApplicants, threshold, smallSampleExclusion });

  return {
    title: `${titlePrefix} by ${categoryLabel.toLowerCase()}`,
    categoryKey,
    rows,
    highestGroup: highestGroup || null,
    highestRate: highestGroup ? round6(highestRate) : null,
  };
}
