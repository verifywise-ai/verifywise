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
import { getRepositoryByOwnerNameForWebhook } from "../utils/aiDetectionRepository.utils";
import {
  verifyGitHubSignature,
  handlePushEvent,
  handlePullRequestEvent,
} from "../services/webhook.service";
import logger from "../utils/logger/fileLogger";

/**
 * Handle GitHub webhook events
 *
 * POST /webhooks/github
 * Headers: X-Hub-Signature-256, X-GitHub-Event
 * Body: raw JSON (parsed after signature verification)
 */
export async function githubWebhookController(
  req: Request,
  res: Response
): Promise<Response> {
  logger.info("Processing GitHub webhook");

  try {
    // 1. Extract headers
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const event = req.headers["x-github-event"] as string | undefined;
    const deliveryId = req.headers["x-github-delivery"] as string | undefined;

    if (!signature) {
      return res.status(401).json(STATUS_CODE[401]("Missing X-Hub-Signature-256 header"));
    }

    if (!event) {
      return res.status(400).json(STATUS_CODE[400]("Missing X-GitHub-Event header"));
    }

    // 2. Get raw body for signature verification
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json(STATUS_CODE[400]("Request body must be raw buffer"));
    }

    // 3. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json(STATUS_CODE[400]("Invalid JSON payload"));
    }

    // 4. Extract repository info from payload
    const repoInfo = payload.repository as
      | { owner?: { login?: string }; name?: string }
      | undefined;
    const owner = repoInfo?.owner?.login;
    const name = repoInfo?.name;

    if (!owner || !name) {
      return res.status(400).json(STATUS_CODE[400]("Missing repository info in payload"));
    }

    // 5. Look up registered repository (with CI enabled)
    const repo = await getRepositoryByOwnerNameForWebhook(owner, name);

    if (!repo) {
      // Return 200 to avoid GitHub retrying — repo not registered or CI disabled
      return res.status(200).json({ message: "Repository not registered or CI not enabled" });
    }

    // 6. Verify HMAC signature
    if (!repo.webhook_secret) {
      return res.status(200).json({ message: "Webhook secret not configured" });
    }

    if (!verifyGitHubSignature(rawBody, signature, repo.webhook_secret)) {
      return res.status(401).json(STATUS_CODE[401]("Invalid signature"));
    }

    // 7. Handle ping event (sent when webhook is first configured)
    if (event === "ping") {
      logger.info(`Webhook ping received for ${owner}/${name} (delivery: ${deliveryId})`);
      return res.status(200).json({ message: "pong" });
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

    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      "Failed to process GitHub webhook:",
      error instanceof Error ? error : new Error(String(error))
    );

    // Always return 200 to prevent GitHub from retrying on internal errors
    // Log the error server-side but don't expose details
    return res.status(200).json({
      triggered: false,
      reason: "Internal processing error",
    });
  }
}
