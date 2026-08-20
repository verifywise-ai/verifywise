/**
 * Slack extension routes.
 *
 * Delegates to the existing slack webhook controllers in
 * Servers/controllers/slackWebhook.ctrl.ts — that implementation predates the
 * extensions system and already handles OAuth exchange, proper AES
 * encryption of access_token/url, and bot-invite. Rebuilding it here would
 * duplicate the encryption logic and risk drift between two code paths, so
 * these routes just mount the same handlers under the extension gate.
 *
 * The legacy /api/slackWebhooks mount stays live for now — the slack
 * extension routes ship alongside it. Frontend can move over incrementally.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import authenticateJWT from "../../middleware/auth.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import {
  createNewSlackWebhook,
  getAllSlackWebhooks,
  getSlackWebhookById,
  updateSlackWebhookById,
  sendSlackMessage,
  deleteSlackWebhookById,
} from "../../controllers/slackWebhook.ctrl";

const router = express.Router();

router.use(authenticateJWT);
router.use(requireExtensionEnabled("slack"));

// Rate limit the OAuth-exchange endpoint so a leaked JWT can't spam
// Slack's OAuth API on our behalf.
const createWorkspaceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    error:
      "Too many Slack workspace creation requests from this IP, please try again after an hour.",
  },
});

// OAuth workspaces — exposed at /api/extensions/slack/oauth/workspaces to match
// the extension's UI conventions. Handlers are shared with /api/slackWebhooks.
router.get("/oauth/workspaces", getAllSlackWebhooks);
router.get("/oauth/workspaces/:id", getSlackWebhookById);
router.post("/oauth/workspaces", createWorkspaceLimiter, createNewSlackWebhook);
router.patch("/oauth/workspaces/:id", updateSlackWebhookById);
router.delete("/oauth/workspaces/:id", deleteSlackWebhookById);

// One-off message send (used by test-connection and manual sends).
router.post("/oauth/workspaces/:id/send", sendSlackMessage);

export default router;
