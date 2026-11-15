import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { getWebhookConfigController } from "../../controllers/aiDetectionRepository.ctrl";

// The URL GitHub sends CI/CD webhooks to, built from the deployment's public
// address. New endpoint, so it lives under /api/v1 (ADR 0001); the rest of the
// repository registry stays on the legacy /api/ai-detection/repositories router.
router.get(
  "/webhook-config",
  authenticateJWT,
  authorize("aiDetectionRepository.read"),
  getWebhookConfigController,
);

export default router;
