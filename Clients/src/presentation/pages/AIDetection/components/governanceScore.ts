/**
 * @fileoverview Shared helpers for the governance score and whether a scan's
 * LLM vulnerability checks ran.
 *
 * @module pages/AIDetection/components/governanceScore
 */

import type { VulnerabilityCheckStatus } from "../../../../domain/ai-detection/types";

/** Settings → Risk scoring, where vulnerability detection is turned on */
export const VULNERABILITY_SETTINGS_PATH = "/ai-detection/settings?tab=risk-scoring";

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
      return "Partial: vulnerability checks failed";
    case "incremental":
      return "Partial: incremental scans skip vulnerability checks";
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
