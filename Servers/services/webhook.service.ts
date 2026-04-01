/**
 * @fileoverview GitHub Webhook Service
 *
 * Handles GitHub webhook events for CI/CD integration.
 * Validates HMAC signatures, routes events to appropriate handlers,
 * and triggers scans based on push/PR events.
 *
 * @module services/webhook
 */

import crypto from "crypto";
import { startScan } from "./aiDetection.service";
import { IServiceContext, ScanMode } from "../domain.layer/interfaces/i.aiDetection";
import { IAIDetectionRepository } from "../domain.layer/interfaces/i.aiDetectionRepository";
import logger from "../utils/logger/fileLogger";

// ============================================================================
// Types
// ============================================================================

interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  repository: {
    owner: { login: string };
    name: string;
    default_branch: string;
  };
  sender: { login: string };
}

interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
  };
  repository: {
    owner: { login: string };
    name: string;
  };
  sender: { login: string };
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify GitHub webhook HMAC-SHA256 signature
 */
export function verifyGitHubSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ============================================================================
// Secret Generation
// ============================================================================

/**
 * Generate a cryptographically secure webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle GitHub push event — triggers full scan on push to default branch
 */
export async function handlePushEvent(
  payload: GitHubPushPayload,
  repo: IAIDetectionRepository & { organization_id: number }
): Promise<{ triggered: boolean; reason: string }> {
  const branch = payload.ref.replace("refs/heads/", "");
  const defaultBranch = repo.default_branch || payload.repository.default_branch;

  if (branch !== defaultBranch) {
    return { triggered: false, reason: `Push to non-default branch: ${branch}` };
  }

  const commitSha = payload.after;

  // Skip if this is a branch deletion (all zeros)
  if (/^0+$/.test(commitSha)) {
    return { triggered: false, reason: "Branch deletion event" };
  }

  const ctx = buildWebhookServiceContext(repo);
  const repositoryUrl = `https://github.com/${payload.repository.owner.login}/${payload.repository.name}`;

  const scan = await startScan(
    repositoryUrl,
    ctx,
    { repositoryId: repo.id, triggeredByType: "webhook" },
    undefined,
    { trigger_type: "webhook", commit_sha: commitSha, branch }
  );

  logger.info(
    `Webhook: started full scan #${scan.id} for push to ${branch} (${commitSha.slice(0, 7)})`
  );

  return { triggered: true, reason: `Full scan #${scan.id} started` };
}

/**
 * Handle GitHub pull_request event — triggers incremental scan on PR open/update
 */
export async function handlePullRequestEvent(
  payload: GitHubPullRequestPayload,
  repo: IAIDetectionRepository & { organization_id: number }
): Promise<{ triggered: boolean; reason: string }> {
  const validActions = ["opened", "synchronize", "reopened"];
  if (!validActions.includes(payload.action)) {
    return { triggered: false, reason: `Ignored PR action: ${payload.action}` };
  }

  const prNumber = payload.number;
  const headSha = payload.pull_request.head.sha;
  const baseSha = payload.pull_request.base.sha;
  const branch = payload.pull_request.head.ref;

  const ctx = buildWebhookServiceContext(repo);
  const repositoryUrl = `https://github.com/${payload.repository.owner.login}/${payload.repository.name}`;

  const incrementalOptions: {
    scan_mode: ScanMode;
    base_commit_sha: string;
    head_commit_sha: string;
  } = {
    scan_mode: "incremental",
    base_commit_sha: baseSha,
    head_commit_sha: headSha,
  };

  const scan = await startScan(
    repositoryUrl,
    ctx,
    { repositoryId: repo.id, triggeredByType: "webhook" },
    incrementalOptions,
    { trigger_type: "webhook", pr_number: prNumber, commit_sha: headSha, branch }
  );

  logger.info(
    `Webhook: started incremental scan #${scan.id} for PR #${prNumber} (${headSha.slice(0, 7)})`
  );

  return { triggered: true, reason: `Incremental scan #${scan.id} started for PR #${prNumber}` };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a synthetic service context for webhook-triggered scans.
 * Uses the repository's created_by user as the triggering user.
 */
function buildWebhookServiceContext(
  repo: IAIDetectionRepository & { organization_id: number }
): IServiceContext {
  return {
    userId: repo.created_by,
    role: "Admin",
    organizationId: repo.organization_id,
    tenantId: repo.organization_id.toString(),
  };
}
