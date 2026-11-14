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
  getRepositoriesForWebhookQuery,
  recordWebhookDeliveryQuery,
} from "../utils/aiDetectionRepository.utils";
import {
  IAIDetectionRepository,
  WebhookDeliveryStatus,
} from "../domain.layer/interfaces/i.aiDetectionRepository";
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

type WebhookRepository = IAIDetectionRepository & { organization_id: number };
type DeliveryResult = { triggered: boolean; reason: string };

const INTERNAL_ERROR_RESULT: DeliveryResult = {
  triggered: false,
  reason: "Internal processing error",
};

/**
 * Handle one verified delivery for one repository and record the outcome.
 * A failure is recorded as "error" on that repository only, so one
 * organization's failure never hides another's result.
 */
async function processDelivery(
  repo: WebhookRepository,
  event: string,
  payload: Record<string, unknown>,
): Promise<DeliveryResult | null> {
  try {
    let result: DeliveryResult;
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
    logger.info(`GitHub webhook ${event} for repository ${repo.id}: ${result.reason}`);
    await recordDelivery(repo, "ok");
    return result;
  } catch (error) {
    logger.error(
      "Failed to process GitHub webhook:",
      error instanceof Error ? error : new Error(String(error)),
    );
    await recordDelivery(repo, "error");
    return null;
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

    // 5. Look up every registered repository (with CI enabled) for this
    // owner/name. The same GitHub repository can be registered by more than
    // one organization, each with its own secret.
    const candidates = await getRepositoriesForWebhookQuery(owner, name);

    if (candidates.length === 0) {
      // Return 200 to avoid GitHub retrying — repo not registered or CI disabled
      return res
        .status(200)
        .json({ message: req.t!("Repository not registered or CI not enabled") });
    }

    // 6. Verify the HMAC signature against each candidate's secret. Only the
    // repositories whose secret verifies are acted on. Secrets are random
    // per repository, so in practice that is the one organization that set
    // up this webhook. Unverified requests never write to any repository row:
    // anyone who knows the public URL could otherwise overwrite the last
    // verified delivery.
    const withSecret = candidates.filter((repo) => !!repo.webhook_secret);
    if (withSecret.length === 0) {
      logStructured(
        "error",
        `webhook rejected for ${owner}/${name}: no signing key configured`,
        "githubWebhookController",
        "webhook.ctrl.ts",
      );
      return res.status(200).json({ message: req.t!("Webhook secret not configured") });
    }

    const verified = withSecret.filter((repo) =>
      verifyGitHubSignature(rawBody, signature, repo.webhook_secret as string),
    );
    if (verified.length === 0) {
      logStructured(
        "error",
        `webhook rejected for ${owner}/${name}: signature did not verify`,
        "githubWebhookController",
        "webhook.ctrl.ts",
      );
      return res.status(401).json(STATUS_CODE[401](req.t!("Invalid signature")));
    }

    // 7. Handle ping event (sent when webhook is first configured)
    if (event === "ping") {
      logger.info(`Webhook ping received for ${owner}/${name} (delivery: ${deliveryId})`);
      for (const repo of verified) {
        await recordDelivery(repo, "ok");
      }
      return res.status(200).json({ message: req.t!("pong") });
    }

    // 8. Route to the handler for each verified repository
    const results: (DeliveryResult | null)[] = [];
    for (const repo of verified) {
      results.push(await processDelivery(repo, event, payload));
    }

    if (results.every((result) => result === null)) {
      return res.status(200).json(STATUS_CODE[200](INTERNAL_ERROR_RESULT));
    }
    const handled = results.map((result) => result ?? INTERNAL_ERROR_RESULT);
    if (handled.length === 1) {
      return res.status(200).json(handled[0]);
    }
    return res.status(200).json({
      triggered: handled.some((result) => result.triggered),
      reason: handled.map((result) => result.reason).join("; "),
    });
  } catch (error) {
    logger.error(
      "Failed to process GitHub webhook:",
      error instanceof Error ? error : new Error(String(error)),
    );

    // Always return 200 to prevent GitHub from retrying on internal errors
    // Log the error server-side but don't expose details
    return res.status(200).json(STATUS_CODE[200](INTERNAL_ERROR_RESULT));
  }
}
