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
import { getFindingsSummaryQuery } from "../../utils/aiDetection.utils";
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

  // Determine pass/fail based on thresholds
  const { passed, description } = evaluateThresholds(scan, repo);

  // Post status check
  if (repo.ci_status_checks) {
    try {
      await postCommitStatus(token, {
        owner,
        repo: repoName,
        sha: scan.commit_sha,
        state: scan.status === "completed" ? (passed ? "success" : "failure") : "error",
        description,
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
      const summary = await buildPRCommentBody(scan, organizationId, passed);
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

function evaluateThresholds(
  scan: IScan,
  repo: IAIDetectionRepository,
): { passed: boolean; description: string } {
  const riskScore = scan.risk_score ?? 0;
  const findingsCount = scan.findings_count ?? 0;

  const scoreExceeded = riskScore > repo.ci_min_score;
  const criticalExceeded = findingsCount > repo.ci_max_critical;

  if (scoreExceeded && criticalExceeded) {
    return {
      passed: false,
      description: `Risk score ${riskScore} exceeds ${repo.ci_min_score} and ${findingsCount} findings exceed ${repo.ci_max_critical}`,
    };
  }
  if (scoreExceeded) {
    return {
      passed: false,
      description: `Risk score ${riskScore} exceeds threshold of ${repo.ci_min_score}`,
    };
  }
  if (criticalExceeded) {
    return {
      passed: false,
      description: `${findingsCount} findings exceed threshold of ${repo.ci_max_critical}`,
    };
  }

  return {
    passed: true,
    description: `Risk score: ${riskScore}, Findings: ${findingsCount}`,
  };
}

// ============================================================================
// PR Comment
// ============================================================================

async function buildPRCommentBody(
  scan: IScan,
  organizationId: number,
  passed: boolean,
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

  const statusEmoji = passed ? "\u2705" : "\u274c";
  const statusText = passed ? "Passed" : "Failed";
  const grade = scan.risk_score_grade || "N/A";

  return `## ${statusEmoji} VerifyWise AI Detection — ${statusText}

| Metric | Value |
|--------|-------|
| **Risk Score** | ${scan.risk_score ?? "N/A"} |
| **Grade** | ${grade} |
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
