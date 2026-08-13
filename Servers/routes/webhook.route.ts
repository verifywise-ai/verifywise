/**
 * @fileoverview Webhook Routes
 *
 * Express router for incoming webhook endpoints.
 * These routes are PUBLIC (no JWT auth) — security is via HMAC signature verification.
 *
 * IMPORTANT: The GitHub webhook endpoint uses express.raw() middleware
 * so the raw body is available for HMAC signature verification.
 *
 * @module routes/webhook
 */

import express from "express";
import { githubWebhookController } from "../controllers/webhook.ctrl";
import { webhookLimiter } from "../middleware/rateLimit.middleware";

const router = express.Router();

// GitHub webhook — rate-limited, then raw body needed for HMAC signature verification
router.post(
  "/github",
  webhookLimiter,
  express.raw({ type: "application/json" }),
  githubWebhookController,
);

export default router;
