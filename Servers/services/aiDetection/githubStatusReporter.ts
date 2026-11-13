/**
 * @fileoverview GitHub Status Reporter
 *
 * Posts scan results back to GitHub as commit status checks and PR comments.
 * Called after webhook-triggered scans complete.
 *
 * @module services/aiDetection/githubStatusReporter
 */

import https from "https";
import { IScan } from "../../domain.layer/interfaces/i.aiDetection";
import { IAIDetectionRepository } from "../../domain.layer/interfaces/i.aiDetectionRepository";
import { getDecryptedGitHubToken } from "../../utils/githubToken.utils";
import { getRepositoryByIdQuery } from "../../utils/aiDetectionRepository.utils";
import { countCriticalFindingsQuery, getFindingsSummaryQuery } from "../../utils/aiDetection.utils";
import logger from "../../utils/logger/fileLogger";

// ============================================================================
// Types
// ============================================================================

interface StatusCheckParams {
  owner: string;
  repo: string;
  sha: string;
  state: "success" | "failure" | "pending" | "error";
  description: string;
  targetUrl?: string;
  context: string;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Report scan results to GitHub after a webhook-triggered scan completes.
 * Posts commit status check and optionally a PR comment.
 */
export async function reportScanToGitHub(scan: IScan, organizationId: number): Promise<void> {
  // Only report for webhook-triggered scans
  if (scan.trigger_type !== "webhook") {
    return;
  }

  if (!scan.commit_sha || !scan.repository_id) {
    logger.warn(`Scan #${scan.id} missing commit_sha or repository_id, skipping GitHub report`);
    return;
  }

  // Fetch repository config for thresholds
  const repo = await getRepositoryByIdQuery(scan.repository_id, organizationId);
  if (!repo) {
    logger.warn(`Repository #${scan.repository_id} not found, skipping GitHub report`);
    return;
  }

  // Get GitHub token
  const token = await getDecryptedGitHubToken(organizationId);
  if (!token) {
    logger.warn(`No GitHub token for org ${organizationId}, skipping GitHub report`);
    return;
  }

  const owner = scan.repository_owner;
  const repoName = scan.repository_name;

  // Count critical findings only for completed scans; other states never reach the gate.
  let criticalCount: number | null = null;
  if (scan.status === "completed" && scan.id) {
    try {
      criticalCount = await countCriticalFindingsQuery(scan.id, organizationId);
    } catch (err) {
      logger.error(`Failed to count critical findings for scan #${scan.id}:`, err);
    }
  }

  // Determine pass/fail based on thresholds
  const evaluation = evaluateThresholds(scan, repo, criticalCount);

  // Post status check
  if (repo.ci_status_checks) {
    try {
      await postCommitStatus(token, {
        owner,
        repo: repoName,
        sha: scan.commit_sha,
        state: evaluation.state,
        description: evaluation.description,
        context: "VerifyWise AI Detection",
      });
      logger.info(`Posted commit status for ${owner}/${repoName}@${scan.commit_sha.slice(0, 7)}`);
    } catch (err) {
      logger.error(`Failed to post commit status for scan #${scan.id}:`, err);
    }
  }

  // Post PR comment
  if (repo.ci_post_comments && scan.pr_number) {
    try {
      const summary = await buildPRCommentBody(scan, organizationId, evaluation, criticalCount);
      await postPRComment(token, owner, repoName, scan.pr_number, summary);
      logger.info(`Posted PR comment on ${owner}/${repoName}#${scan.pr_number}`);
    } catch (err) {
      logger.error(`Failed to post PR comment for scan #${scan.id}:`, err);
    }
  }
}

// ============================================================================
// Threshold Evaluation
// ============================================================================

export interface ThresholdEvaluation {
  /** Commit status state to post */
  state: "success" | "failure" | "error";
  /** True only when the scan completed and both thresholds pass */
  passed: boolean;
  description: string;
}

/**
 * Evaluate a completed scan against the repository's CI thresholds.
 *
 * - The governance score (`risk_score`) is 0–100 where 100 is safest (AGRS).
 *   The gate fails when the score, rounded to the whole number shown in the
 *   status, is BELOW `ci_min_score`; a score equal to the minimum passes.
 * - `ci_max_critical` limits the number of critical findings, as counted by
 *   `countCriticalFindingsQuery` (severity "critical" or a hardcoded secret,
 *   excluding suppressed, accepted-risk and fixed findings). It is not the
 *   total findings count.
 * - A scan that did not complete, has no governance score, or whose critical
 *   count could not be read reports "error" instead of passing silently.
 */
export function evaluateThresholds(
  scan: IScan,
  repo: Pick<IAIDetectionRepository, "ci_min_score" | "ci_max_critical">,
  criticalCount: number | null,
): ThresholdEvaluation {
  if (scan.status !== "completed") {
    return {
      state: "error",
      passed: false,
      description: `Scan ${scan.status ?? "did not complete"}; thresholds were not evaluated`,
    };
  }

  const rawScore = scan.risk_score;
  // NUMERIC columns come back from pg as strings ("62.00")
  const score = rawScore === null || rawScore === undefined ? NaN : Number(rawScore);
  if (Number.isNaN(score)) {
    return {
      state: "error",
      passed: false,
      description: "Governance score is not available, so thresholds could not be evaluated",
    };
  }
  if (criticalCount === null) {
    return {
      state: "error",
      passed: false,
      description: "Critical findings could not be counted, so thresholds could not be evaluated",
    };
  }

  // Compare the whole-number score that is shown, so the message can never
  // read "70 is below the minimum of 70" for a stored 69.6.
  const displayScore = Math.round(score);
  const scoreBelowMinimum = displayScore < repo.ci_min_score;
  const criticalExceeded = criticalCount > repo.ci_max_critical;
  const criticalLabel = criticalCount === 1 ? "critical finding" : "critical findings";
  const exceedVerb = criticalCount === 1 ? "exceeds" : "exceed";

  if (scoreBelowMinimum && criticalExceeded) {
    return {
      state: "failure",
      passed: false,
      description: `Governance score ${displayScore} is below the minimum of ${repo.ci_min_score} and ${criticalCount} ${criticalLabel} ${exceedVerb} the limit of ${repo.ci_max_critical}`,
    };
  }
  if (scoreBelowMinimum) {
    return {
      state: "failure",
      passed: false,
      description: `Governance score ${displayScore} is below the minimum of ${repo.ci_min_score}`,
    };
  }
  if (criticalExceeded) {
    return {
      state: "failure",
      passed: false,
      description: `${criticalCount} ${criticalLabel} ${exceedVerb} the limit of ${repo.ci_max_critical}`,
    };
  }

  return {
    state: "success",
    passed: true,
    description: `Governance score ${displayScore} (minimum ${repo.ci_min_score}), ${criticalCount} ${criticalLabel} (limit ${repo.ci_max_critical})`,
  };
}

// ============================================================================
// PR Comment
// ============================================================================

async function buildPRCommentBody(
  scan: IScan,
  organizationId: number,
  evaluation: ThresholdEvaluation,
  criticalCount: number | null,
): Promise<string> {
  let summaryDetails = "";
  try {
    const summary = await getFindingsSummaryQuery(scan.id!, organizationId);
    if (summary) {
      const entries = Object.entries(summary.by_finding_type)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `- **${type}**: ${count}`);
      if (entries.length > 0) {
        summaryDetails = `\n\n### Findings by Type\n${entries.join("\n")}`;
      }
    }
  } catch {
    // Non-critical, continue without detailed summary
  }

  const statusEmoji = evaluation.passed ? "\u2705" : "\u274c";
  const statusText =
    evaluation.state === "success" ? "Passed" : evaluation.state === "failure" ? "Failed" : "Error";
  const grade = scan.risk_score_grade || "N/A";
  const score =
    scan.risk_score === null || scan.risk_score === undefined
      ? "N/A"
      : String(Math.round(Number(scan.risk_score)));

  return `## ${statusEmoji} VerifyWise AI Detection — ${statusText}

${evaluation.description}

| Metric | Value |
|--------|-------|
| **Governance score** | ${score} |
| **Grade** | ${grade} |
| **Critical findings** | ${criticalCount ?? "N/A"} |
| **Findings** | ${scan.findings_count ?? 0} |
| **Files Scanned** | ${scan.files_scanned ?? 0} |
| **Scan Mode** | ${scan.scan_mode ?? "full"} |
| **Duration** | ${scan.duration_ms ? `${(scan.duration_ms / 1000).toFixed(1)}s` : "N/A"} |
${summaryDetails}

---
*Scan #${scan.id} triggered by webhook*`;
}

// ============================================================================
// GitHub API Helpers
// ============================================================================

function postCommitStatus(token: string, params: StatusCheckParams): Promise<void> {
  return githubApiRequest(
    token,
    "POST",
    `/repos/${params.owner}/${params.repo}/statuses/${params.sha}`,
    {
      state: params.state,
      description: params.description.slice(0, 140),
      context: params.context,
      ...(params.targetUrl ? { target_url: params.targetUrl } : {}),
    },
  );
}

function postPRComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  return githubApiRequest(token, "POST", `/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    body,
  });
}

function githubApiRequest(
  token: string,
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "User-Agent": "VerifyWise-AI-Detection",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(
            new Error(`GitHub API ${method} ${path} returned ${res.statusCode}: ${responseData}`),
          );
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
