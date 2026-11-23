import express from "express";
const router = express.Router();

import {
  getDecisionStats,
  getResearchConfig,
  getResearchSearchStatus,
  getResearchSettings,
  saveResearchSettings,
} from "../../controllers/vendorResearch.ctrl";

import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";

// GET requests
// What the vendor research button depends on. Any signed-in user may read it, and it holds no key.
router.get("/config", authenticateJWT, getResearchConfig);
// The rate of acceptance by prompt version: it is how a change to the agent is judged, so it goes to
// those who manage the organization's LLM key (built-in: Admin only).
router.get("/decision-stats", authenticateJWT, authorize("llmKeys.admin"), getDecisionStats);

// Which of the organization's LLM keys the research and the analysis use. Those who manage the keys
// choose; it is a choice of a provider that sees the vendor data (built-in: Admin only).
router.get("/settings", authenticateJWT, authorize("llmKeys.admin"), getResearchSettings);
// Which search each key gets and whether the news search has been failing: what the settings
// window warns about. It names keys by id, so it goes to the same people as the settings.
router.get("/search-status", authenticateJWT, authorize("llmKeys.admin"), getResearchSearchStatus);

// PUT requests
router.put("/settings", authenticateJWT, authorize("llmKeys.admin"), saveResearchSettings);

export default router;
