import { round6 } from "./round";
import type { AuditRecord, CategoryTable, GroupResult } from "./types";

export interface IntersectionalArgs {
  records: AuditRecord[];
  crossKeys: string[];
  totalApplicants: number;
  threshold: number | null;
  smallSampleExclusion: number | null;
  rateOf: (record: AuditRecord) => boolean;
  title?: string;
}

/**
 * Impact ratios for each combination of the crossed categories.
 *
 * § 5-301(c)(4)(iii) makes the sex × race/ethnicity intersection mandatory,
 * and it is the requirement most often skipped by anyone working from the
 * four-fifths rule rather than the rule text. For LL 144 this is 14 cells.
 *
 * Ported from EvalServer's `_compute_intersectional_table` (engine.py:267).
 * A record missing any crossed attribute is skipped, as in the Python.
 */
export function computeIntersectionalTable(args: IntersectionalArgs): CategoryTable {
  const {
    records,
    crossKeys,
    totalApplicants,
    threshold,
    smallSampleExclusion,
    rateOf,
    title = "Impact ratios by intersectional category",
  } = args;

  const groups = new Map<string, { applicants: number; selected: number }>();
  for (const record of records) {
    const parts = crossKeys.map((k) => String(record[k] ?? ""));
    if (parts.some((p) => !p)) continue;
    // Python joins with " - " (engine.py:291), not a bare space. The cell
    // name is also the sort key, so a wrong separator changes ordering and
    // with it which cell becomes the reference.
    const name = parts.join(" - ");
    const entry = groups.get(name) ?? { applicants: 0, selected: 0 };
    entry.applicants += 1;
    if (rateOf(record)) entry.selected += 1;
    groups.set(name, entry);
  }

  const rows: GroupResult[] = [];
  let highestRate = 0;
  let highestGroup = "";

  for (const name of [...groups.keys()].sort()) {
    const { applicants, selected } = groups.get(name)!;
    const rate = applicants > 0 ? selected / applicants : 0;
    if (rate > highestRate) {
      highestRate = rate;
      highestGroup = name;
    }
    rows.push({
      categoryType: "intersectional",
      categoryName: name,
      applicantCount: applicants,
      selectedCount: selected,
      selectionRate: round6(rate),
      impactRatio: null,
      excluded: false,
      flagged: false,
    });
  }

  for (const row of rows) {
    if (smallSampleExclusion && totalApplicants > 0) {
      const proportion = row.applicantCount / totalApplicants;
      if (proportion < smallSampleExclusion) {
        row.excluded = true;
        row.impactRatio = null;
        continue;
      }
    }
    if (highestRate > 0) {
      const ratio = row.selectionRate / highestRate;
      row.impactRatio = round6(ratio);
      if (threshold !== null && ratio < threshold) row.flagged = true;
    } else {
      row.impactRatio = null;
    }
  }

  return {
    title,
    categoryKey: "intersectional",
    rows,
    // The Python returns highest_group as the empty string when nothing was
    // selected (engine.py:334) but gates highest_rate on `> 0`, so the two
    // fields disagree in that case. Both are reproduced as they are.
    highestGroup: highestGroup,
    highestRate: highestRate > 0 ? round6(highestRate) : null,
  };
}
