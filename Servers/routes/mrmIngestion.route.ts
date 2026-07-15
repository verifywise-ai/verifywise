import express from "express";
const router = express.Router();
import mrmIngestionAuth from "../middleware/mrmIngestionAuth.middleware";
import { mrmIngestionLimiter } from "../middleware/rateLimit.middleware";
import { ingestMetrics } from "../controllers/mrmMonitoring.ctrl";

/**
 * MRM metric-ingestion surface — MACHINE-to-machine, token-authenticated.
 *
 * This is deliberately a SEPARATE router from the JWT-authed /api/mrm routes:
 * pushes come from a customer's headless monitoring pipeline (a cron / job),
 * not a logged-in user, so it uses the ingestion-token middleware instead of
 * authenticateJWT, and its own generous rate limiter (mrmIngestionLimiter)
 * rather than the strict auth/general limiters.
 *
 * Mounted at /api/mrm in app.ts (alongside the JWT router — Express allows two
 * routers on the same base path; there is no path collision because the JWT
 * router has no POST /models/:externalModelKey/metrics route). This keeps the
 * canonical spec path `/api/mrm/models/:externalModelKey/metrics`.
 */

// POST /api/mrm/models/:externalModelKey/metrics
// Single point {metric,value,at,window?,segment?,context?} OR batch {points:[...]}.
// Auth runs BEFORE the limiter so the limiter can key on the resolved token
// (req.mrmIngestionToken.tokenId) rather than IP — see mrmIngestion keyGenerator.
router.post(
  "/models/:externalModelKey/metrics",
  mrmIngestionAuth,
  mrmIngestionLimiter,
  ingestMetrics,
);

export default router;
