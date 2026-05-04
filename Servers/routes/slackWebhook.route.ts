import express from "express";
import rateLimit from "express-rate-limit";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import {
  createNewSlackWebhook,
  getAllSlackWebhooks,
  getSlackWebhookById,
  updateSlackWebhookById,
  sendSlackMessage,
  deleteSlackWebhookById,
} from "../controllers/slackWebhook.ctrl";

// Rate limiter for expensive routes (e.g., create webhook)
const createWebhookLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // limit each IP to 10 create requests per windowMs
  message: {
    error: "Too many webhook creation requests from this IP, please try again after an hour.",
  },
});
// GET requests
router.get("/", authenticateJWT, getAllSlackWebhooks);
router.get("/:id", authenticateJWT, getSlackWebhookById);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, createWebhookLimiter, createNewSlackWebhook);
router.patch("/:id", authenticateJWT, updateSlackWebhookById);
router.delete("/:id", authenticateJWT, deleteSlackWebhookById);

// Send slack message
router.post("/:id/send", authenticateJWT, sendSlackMessage);

export default router;
