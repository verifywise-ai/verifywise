import { getCoverageScanRowsQuery, CoverageScanRow } from "../../utils/riskLink.utils";

/**
 * F8 — Control coverage gap report.
 *
 * Read-only: which risk is not mitigated by any control, separated from
 * "this risk's project has no framework attached, so there is nothing to map
 * to". It writes nothing — no `risk_links` rows, no cache rows, no migration.
 */

export const MAX_COVERAGE_ROWS = 500; // per list

export interface CoverageGapRisk {
  id: number;
  risk_name: string;
  risk_owner: number | null;
  risk_level: string | null; // risk_level_autocalculated::text
  mitigation_status: string | null;
  projects: { id: number; name: string; has_framework: boolean }[];
  assessment_link_count: number; // §4 — context only, never affects state
}

export interface CoverageReport {
  summary: {
    total_active_risks: number;
    covered: number;
    gap: number;
    no_framework: number;
  };
  gaps: CoverageGapRisk[]; // state = 'gap', worst first
  no_framework: CoverageGapRisk[]; // state = 'no_framework', worst first
  truncated: boolean;
}

type CoverageState = "covered" | "gap" | "no_framework";

/**
 * State rule, in order: any control-side link covers; otherwise any
 * framework-attached project makes the unmapped risk a real gap; otherwise
 * there is nothing to map to yet. `assessment_link_count` rides along in the
 * output and must never influence the state — a risk linked only to a
 * questionnaire answer is still an audit finding. Do not "fix" this.
 */
export function coverageState(row: CoverageScanRow): CoverageState {
  if (row.control_link_count > 0) return "covered";
  if (row.framework_project_count > 0) return "gap";
  return "no_framework";
}

function toGapRisk(row: CoverageScanRow): CoverageGapRisk {
  return {
    id: row.id,
    risk_name: row.risk_name,
    risk_owner: row.risk_owner,
    risk_level: row.risk_level,
    mitigation_status: row.mitigation_status,
    projects: row.projects,
    assessment_link_count: row.assessment_link_count,
  };
}

export async function findControlCoverage(organizationId: number): Promise<CoverageReport> {
  // Rows arrive pre-capped per state (worst-first) with honest per-state
  // totals; the lists are used verbatim and the summary from the totals.
  // `coverageState` below is the grouping authority — it must agree with the
  // SQL CASE, and the integration suite pins all three states.
  const rows = await getCoverageScanRowsQuery(organizationId, MAX_COVERAGE_ROWS);

  const gaps: CoverageGapRisk[] = [];
  const noFramework: CoverageGapRisk[] = [];
  let covered = 0;
  let gapTotal = 0;
  let noFrameworkTotal = 0;
  const seenTotals = new Set<string>();
  for (const row of rows) {
    if (coverageState(row) !== row.state) {
      throw new Error(
        `coverage state drift: SQL says ${row.state} but coverageState says ${coverageState(row)} for risk ${row.id}`,
      );
    }
    if (!seenTotals.has(row.state)) {
      seenTotals.add(row.state);
      if (row.state === "covered") covered = row.state_total;
      else if (row.state === "gap") gapTotal = row.state_total;
      else noFrameworkTotal = row.state_total;
    }
    if (row.state === "gap") gaps.push(toGapRisk(row));
    else if (row.state === "no_framework") noFramework.push(toGapRisk(row));
  }

  return {
    summary: {
      total_active_risks: covered + gapTotal + noFrameworkTotal,
      covered,
      gap: gapTotal,
      no_framework: noFrameworkTotal,
    },
    gaps,
    no_framework: noFramework,
    truncated: gapTotal > MAX_COVERAGE_ROWS || noFrameworkTotal > MAX_COVERAGE_ROWS,
  };
}
