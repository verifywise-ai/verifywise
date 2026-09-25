import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import { slackWebhookCreateLimiter } from "../middleware/rateLimit.middleware";
import {
  createNewSlackWebhook,
  getAllSlackWebhooks,
  getSlackWebhookById,
  updateSlackWebhookById,
  sendSlackMessage,
  deleteSlackWebhookById,
} from "../controllers/slackWebhook.ctrl";

// GET requests
router.get("/", authenticateJWT, getAllSlackWebhooks);
router.get("/:id", authenticateJWT, getSlackWebhookById);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, slackWebhookCreateLimiter, createNewSlackWebhook);
router.patch("/:id", authenticateJWT, updateSlackWebhookById);
router.delete("/:id", authenticateJWT, deleteSlackWebhookById);

// Send slack message
router.post("/:id/send", authenticateJWT, sendSlackMessage);

export default router;
