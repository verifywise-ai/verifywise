/**
 * DEPRECATED legacy alias: /api/slackWebhooks.
 *
 * Kept per ADR 0001 (docs/technical/adr/0001-api-versioning.md): unversioned
 * paths are frozen and are only removed through the deprecation process. The
 * client uses /api/extensions/slack/oauth/workspaces
 * (extensions/slack/slack.route.ts). Remove this alias in a dedicated PR after
 * at least one release cycle.
 *
 * Same six operations as before, now with the same handlers and the same
 * gates as the extension route: JWT, the Slack extension enabled for the
 * caller's organization, the "extension.admin" permission (Admin), and
 * slackWorkspaceCreateLimiter on create. Every handler is scoped to the
 * caller's organization.
 */
import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { requireExtensionEnabled } from "../middleware/requireExtensionEnabled.middleware";
import { slackWorkspaceCreateLimiter } from "../middleware/rateLimit.middleware";
import {
  createNewSlackWebhook,
  getAllSlackWebhooks,
  getSlackWebhookById,
  updateSlackWebhookById,
  sendSlackMessage,
  deleteSlackWebhookById,
} from "../controllers/slackWebhook.ctrl";

const router = express.Router();

router.use(authenticateJWT);
router.use(requireExtensionEnabled("slack"));

const admin = authorize("extension.admin");

router.get("/", admin, getAllSlackWebhooks);
router.get("/:id", admin, getSlackWebhookById);
router.post("/", admin, slackWorkspaceCreateLimiter, createNewSlackWebhook);
router.patch("/:id", admin, updateSlackWebhookById);
router.delete("/:id", admin, deleteSlackWebhookById);
router.post("/:id/send", admin, sendSlackMessage);

export default router;
