import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { getBadges, reviewContent, getUnreviewed, getStats } from "../controllers/aiContent.ctrl";

const router = express.Router();

// GET AI content statistics (must be before /:entityType to avoid route conflict)
router.get("/stats", authenticateJWT, getStats);

// GET all unreviewed AI content (must be before /:entityType to avoid route conflict)
router.get("/unreviewed", authenticateJWT, getUnreviewed);

// GET badges for a specific entity
router.get("/:entityType/:entityId", authenticateJWT, getBadges);

// PATCH mark as reviewed
router.patch("/:id/review", authenticateJWT, reviewContent);

export default router;
