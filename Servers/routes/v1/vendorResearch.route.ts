import express from "express";
const router = express.Router();

import {
  deleteResearchSearchKey,
  getDecisionStats,
  getResearchConfig,
  getResearchSearchKey,
  getResearchSearchStatus,
  getResearchSettings,
  saveResearchSearchKey,
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
// Whether the organization stored a Brave Search key for the research, and its last four
// characters; never the key. Same people as the settings.
router.get("/search-key", authenticateJWT, authorize("llmKeys.admin"), getResearchSearchKey);

// PUT requests
router.put("/settings", authenticateJWT, authorize("llmKeys.admin"), saveResearchSettings);
// Stores the Brave Search key after checking it with Brave.
router.put("/search-key", authenticateJWT, authorize("llmKeys.admin"), saveResearchSearchKey);

// DELETE requests
router.delete("/search-key", authenticateJWT, authorize("llmKeys.admin"), deleteResearchSearchKey);

export default router;
