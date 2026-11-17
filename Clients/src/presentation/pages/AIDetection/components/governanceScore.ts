/**
 * @fileoverview Shared helpers for the governance score and whether a scan's
 * LLM vulnerability checks ran.
 *
 * @module pages/AIDetection/components/governanceScore
 */

import type {
  SecuritySummary,
  VulnerabilityCheckStatus,
} from "../../../../domain/ai-detection/types";

/** Settings → Risk scoring, where vulnerability detection is turned on */
export const VULNERABILITY_SETTINGS_PATH = "/ai-detection/settings?tab=risk-scoring";

/** How often to re-read a scan while its background AI analysis is running */
export const LLM_ANALYSIS_POLL_MS = 5000;

/**
 * Upper bound on re-reads while AI analysis is pending: 11 minutes. The
 * server reports an analysis pending for over 10 minutes as failed, so a
 * page that keeps reading always sees it end before this.
 */
export const LLM_ANALYSIS_POLL_ATTEMPTS = Math.ceil((11 * 60 * 1000) / LLM_ANALYSIS_POLL_MS);

/**
 * Whether the scan found no model files, so the model security check had
 * nothing to check. Based on the unfiltered summary only, so the tab badge
 * and the tab body agree whatever severity filter is active.
 */
export function hasNoModelFiles(summary: SecuritySummary | null | undefined): boolean {
  return summary != null && summary.model_files_scanned === 0 && summary.total === 0;
}

/**
 * Whether the score leaves out vulnerability checks. Scans made before the
 * status was recorded (null) are not marked: we can't tell.
 */
export function isScorePartial(status: VulnerabilityCheckStatus | null | undefined): boolean {
  return status === "off" || status === "failed" || status === "incremental";
}

/** Card copy explaining why a score is partial, or null when it isn't */
export function partialScoreLabel(
  status: VulnerabilityCheckStatus | null | undefined,
): string | null {
  switch (status) {
    case "off":
      return "Partial: vulnerability checks off";
    case "failed":
      return "Partial: vulnerability checks didn't finish";
    case "incremental":
      return "Partial: changed files not checked for vulnerabilities";
    default:
      return null;
  }
}

/**
 * Whether the Vulnerabilities tab can claim "checked". True when checks ran
 * or vulnerability findings exist; false when they didn't run or we can't
 * tell (older scans with no findings).
 */
export function vulnerabilityChecksRan(
  status: VulnerabilityCheckStatus | null | undefined,
  vulnerabilityFindingCount: number,
): boolean {
  if (status === "ran") return true;
  if (status == null) return vulnerabilityFindingCount > 0;
  return false;
}
