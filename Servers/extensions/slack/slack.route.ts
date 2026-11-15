/**
 * Slack extension routes: the organization's Slack connections, at
 * /api/extensions/slack/oauth/workspaces.
 *
 * Handlers live in Servers/controllers/slackWebhook.ctrl.ts (OAuth exchange,
 * AES encryption of access_token/url, bot invite). Every route needs the
 * extension enabled for the caller's organization and the "extension.admin"
 * permission (Admin): connections belong to the organization, and the only
 * screen that reads them is the Admin-only extension settings page. Each
 * handler filters by the caller's organization, so another organization's id
 * answers 404.
 *
 * This is the only mount. The legacy /api/slackWebhooks router was removed.
 */

import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../../middleware/requireExtensionEnabled.middleware";
import { slackWorkspaceCreateLimiter } from "../../middleware/rateLimit.middleware";
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

const admin = authorize("extension.admin");

router.get("/oauth/workspaces", admin, getAllSlackWebhooks);
router.get("/oauth/workspaces/:id", admin, getSlackWebhookById);
// Rate limited so a leaked token can't spam Slack's OAuth API on our behalf.
router.post("/oauth/workspaces", admin, slackWorkspaceCreateLimiter, createNewSlackWebhook);
router.patch("/oauth/workspaces/:id", admin, updateSlackWebhookById);
router.delete("/oauth/workspaces/:id", admin, deleteSlackWebhookById);

// Test message to this one connection's channel.
router.post("/oauth/workspaces/:id/send", admin, sendSlackMessage);

export default router;
