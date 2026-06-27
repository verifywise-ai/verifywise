import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  regulationsTrackerSyncLimiter,
  regulationsTrackerImpactLimiter,
} from "../middleware/rateLimit.middleware";
import {
  getCountries,
  getCountryDetail,
  getTracked,
  trackCountryCtrl,
  trackBulkCtrl,
  untrackCountryCtrl,
  getSettingsCtrl,
  updateSettingsCtrl,
  getHorizon,
  getDeadlines,
  getFrameworks,
  triggerSync,
  getImpactAnalysis,
  refreshImpactAnalysis,
} from "../controllers/regulationsTracker.ctrl";

const router = express.Router();

router.get("/countries", authenticateJWT, getCountries);
// MUST be registered before "/countries/:slug" — Express is greedy on path params,
// otherwise "/countries/france/impact" would route to getCountryDetail with slug="france/impact".
router.get("/countries/:slug/impact", authenticateJWT, getImpactAnalysis);
router.post(
  "/countries/:slug/impact/refresh",
  authenticateJWT,
  regulationsTrackerImpactLimiter,
  refreshImpactAnalysis,
);
router.get("/countries/:slug", authenticateJWT, getCountryDetail);
router.get("/tracked", authenticateJWT, getTracked);
router.post("/tracked/bulk", authenticateJWT, trackBulkCtrl);
router.post("/tracked", authenticateJWT, trackCountryCtrl);
router.delete("/tracked/:slug", authenticateJWT, untrackCountryCtrl);
router.get("/settings", authenticateJWT, getSettingsCtrl);
router.put("/settings", authenticateJWT, updateSettingsCtrl);
router.get("/horizon", authenticateJWT, getHorizon);
router.get("/deadlines", authenticateJWT, getDeadlines);
router.get("/frameworks", authenticateJWT, getFrameworks);
router.post("/sync", authenticateJWT, regulationsTrackerSyncLimiter, triggerSync);

export default router;
