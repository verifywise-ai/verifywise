/**
 * @fileoverview GitHub Webhook Controller
 *
 * Handles incoming GitHub webhook requests.
 * Validates HMAC signatures and routes events to the webhook service.
 * This endpoint is PUBLIC (no JWT auth) — security is via HMAC signature.
 *
 * @module controllers/webhook
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getRepositoryByOwnerNameForWebhook,
  recordWebhookDeliveryQuery,
} from "../utils/aiDetectionRepository.utils";
import { WebhookDeliveryStatus } from "../domain.layer/interfaces/i.aiDetectionRepository";
import {
  verifyGitHubSignature,
  handlePushEvent,
  handlePullRequestEvent,
} from "../services/webhook.service";
import logger, { logStructured } from "../utils/logger/fileLogger";

/**
 * Store the outcome of a signature-verified delivery on the repository, for
 * the "Last delivery" line in the repository settings. Only called after the
 * HMAC check passes. Never fails the webhook response.
 */
async function recordDelivery(
  repo: { id?: number; organization_id: number },
  status: WebhookDeliveryStatus,
): Promise<void> {
  if (!repo.id) return;
  try {
    await recordWebhookDeliveryQuery(repo.id, repo.organization_id, status);
  } catch (error) {
    logger.error(
      "Failed to record webhook delivery:",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Handle GitHub webhook events
 *
 * POST /webhooks/github
 * Headers: X-Hub-Signature-256, X-GitHub-Event
 * Body: raw JSON (parsed after signature verification)
 */
export async function githubWebhookController(req: Request, res: Response): Promise<Response> {
  logger.info("Processing GitHub webhook");

  let matchedRepo: Awaited<ReturnType<typeof getRepositoryByOwnerNameForWebhook>> = null;

  try {
    // 1. Extract headers
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const event = req.headers["x-github-event"] as string | undefined;
    const deliveryId = req.headers["x-github-delivery"] as string | undefined;

    if (!signature) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Missing X-Hub-Signature-256 header")));
    }

    if (!event) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Missing X-GitHub-Event header")));
    }

    // 2. Get raw body for signature verification
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Request body must be raw buffer")));
    }

    // 3. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid JSON payload")));
    }

    // 4. Extract repository info from payload
    const repoInfo = payload.repository as
      { owner?: { login?: string }; name?: string } | undefined;
    const owner = repoInfo?.owner?.login;
    const name = repoInfo?.name;

    if (!owner || !name) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Missing repository info in payload")));
    }

    // 5. Look up registered repository (with CI enabled)
    const repo = await getRepositoryByOwnerNameForWebhook(owner, name);

    if (!repo) {
      // Return 200 to avoid GitHub retrying — repo not registered or CI disabled
      return res
        .status(200)
        .json({ message: req.t!("Repository not registered or CI not enabled") });
    }

    // 6. Verify HMAC signature
    // Unverified requests never write to the repository row: anyone who knows
    // the public URL could otherwise overwrite the last verified delivery.
    if (!repo.webhook_secret) {
      logStructured(
        "error",
        `webhook rejected for repository ${repo.id}: no secret configured`,
        "githubWebhookController",
        "webhook.ctrl.ts",
      );
      return res.status(200).json({ message: req.t!("Webhook secret not configured") });
    }

    if (!verifyGitHubSignature(rawBody, signature, repo.webhook_secret)) {
      logStructured(
        "error",
        `webhook rejected for repository ${repo.id}: signature did not verify`,
        "githubWebhookController",
        "webhook.ctrl.ts",
      );
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid signature")));
    }

    matchedRepo = repo;

    // 7. Handle ping event (sent when webhook is first configured)
    if (event === "ping") {
      logger.info(`Webhook ping received for ${owner}/${name} (delivery: ${deliveryId})`);
      await recordDelivery(repo, "ok");
      return res.status(200).json({ message: req.t!("pong") });
    }

    // 8. Route to appropriate handler
    let result: { triggered: boolean; reason: string };

    switch (event) {
      case "push":
        result = await handlePushEvent(payload as any, repo);
        break;

      case "pull_request":
        result = await handlePullRequestEvent(payload as any, repo);
        break;

      default:
        result = { triggered: false, reason: `Unsupported event type: ${event}` };
    }

    logger.info(`GitHub webhook ${event}: ${result.reason}`);
    await recordDelivery(repo, "ok");

    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      "Failed to process GitHub webhook:",
      error instanceof Error ? error : new Error(String(error)),
    );
    if (matchedRepo) {
      await recordDelivery(matchedRepo, "error");
    }

    // Always return 200 to prevent GitHub from retrying on internal errors
    // Log the error server-side but don't expose details
    return res.status(200).json(
      STATUS_CODE[200]({
        triggered: false,
        reason: "Internal processing error",
      }),
    );
  }
}
