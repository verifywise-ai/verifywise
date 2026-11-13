/**
 * What the AI Detection scan notifier knows about one finished scan. Built by
 * services/aiDetection/scanNotifications.ts and shared by its in-app notices,
 * emails and Automations triggers.
 */
export interface IAiDetectionScanSummary {
  scanId: number;
  /** "owner/repo" */
  repository: string;
  status: "completed" | "failed";
  /** "manual", "scheduled" or "webhook" */
  triggeredByType: string;
  /** Absolute link to the scan details page. */
  url: string;
  findingsCount: number;
  /** Counted high-risk findings in this scan, exposed secrets included. */
  highRiskCount: number;
  /** Counted exposed secrets in this scan. */
  secretCount: number;
  /** Null when the governance score could not be calculated. */
  score: number | null;
  grade: string | null;
  previousGrade: string | null;
  gradeDropped: boolean;
  /** High-risk findings the previous scan of the repository did not have (secrets included). */
  newHighRiskNames: string[];
  /** Exposed secrets the previous scan of the repository did not have. */
  newSecretNames: string[];
  /** True when no earlier completed scan of the repository exists. */
  isFirstScan: boolean;
  /** Short failure reason (failed scans only). */
  errorMessage: string | null;
}

const NOT_CALCULATED = "Not calculated";
const MAX_LISTED_FINDINGS = 10;

/** Names joined for a template, capped so an email body stays readable. */
export const listFindingNames = (names: string[]): string => {
  if (names.length === 0) return "None";
  const shown = names.slice(0, MAX_LISTED_FINDINGS).join(", ");
  const rest = names.length - MAX_LISTED_FINDINGS;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
};

/**
 * Template variables for the ai_detection_* Automations triggers. The keys
 * are what the Automations UI lists for these triggers
 * (Clients/.../Automations/components/ConfigurationPanel).
 */
export function buildAiDetectionScanReplacements(
  summary: IAiDetectionScanSummary,
): Record<string, string | number> {
  return {
    "scan.id": summary.scanId,
    "scan.repository": summary.repository,
    "scan.url": summary.url,
    "scan.status": summary.status,
    "scan.trigger": summary.triggeredByType,
    "scan.findings_count": summary.findingsCount,
    "scan.high_risk_count": summary.highRiskCount,
    "scan.secret_count": summary.secretCount,
    "scan.score": summary.score != null ? summary.score : NOT_CALCULATED,
    "scan.grade": summary.grade ?? NOT_CALCULATED,
    "scan.previous_grade": summary.previousGrade ?? NOT_CALCULATED,
    "scan.new_high_risk_count": summary.newHighRiskNames.length,
    "scan.new_high_risk_findings": listFindingNames(summary.newHighRiskNames),
    "scan.new_secret_count": summary.newSecretNames.length,
    "scan.error": summary.errorMessage ?? "",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
