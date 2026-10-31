/**
 * The research routes of a vendor: the state of its research, the trace of a run and starting a run.
 *
 * The vendor research agent came after ADR 0001, so its endpoints are versioned. This router holds
 * the research sub-routes only: vendor CRUD stays on the legacy /api/vendors (routes/vendor.route.ts),
 * because ADR 0001 section 5 forbids a v1 copy of a contract that did not change.
 */
import express from "express";
const router = express.Router();

import {
  getLatestVendorResearch,
  getVendorResearchRunTrace,
  startVendorResearchRun,
} from "../../controllers/vendorResearch.ctrl";

import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";

// GET requests
// Read-only, so authenticateJWT only: every role may see the state of the research.
router.get("/:id/research/latest", authenticateJWT, getLatestVendorResearch);
// The trace holds the queries and addresses a run used and the tokens it spent, so it goes to those
// who manage the organization's LLM key (built-in: Admin only).
router.get(
  "/:id/research/runs/:runId/trace",
  authenticateJWT,
  authorize("llmKeys.admin"),
  getVendorResearchRunTrace,
);

// POST requests
// Starting research spends searches and model calls, so it needs the right to edit risks.
router.post("/:id/research", authenticateJWT, authorize("risks.edit"), startVendorResearchRun);

export default router;
