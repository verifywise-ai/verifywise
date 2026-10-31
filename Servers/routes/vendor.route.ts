import express from "express";
const router = express.Router();

import {
  createVendor,
  deleteVendorById,
  getAllVendors,
  getVendorById,
  getVendorByProjectId,
  getVendorRiskSuggestions,
  updateVendorById,
} from "../controllers/vendor.ctrl";
import {
  getLatestVendorResearch,
  getVendorResearchRunTrace,
  startVendorResearchRun,
} from "../controllers/vendorResearch.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/", authenticateJWT, getAllVendors);
router.get("/project-id/:id", authenticateJWT, getVendorByProjectId);
router.get("/:id", authenticateJWT, getVendorById);
// No ordering hazard: /:id matches one segment and cannot swallow this path.
// Read-only report, so authenticateJWT only — same as /dismissals and /duplicates.
router.get("/:id/riskSuggestions", authenticateJWT, getVendorRiskSuggestions);
// No ordering hazard either: /:id matches one segment and cannot swallow this path.
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

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, authorize("vendor.edit"), createVendor);
// Starting research spends searches and model calls, so it needs the right to edit risks.
router.post("/:id/research", authenticateJWT, authorize("risks.edit"), startVendorResearchRun);
router.patch("/:id", authenticateJWT, authorize("vendor.edit"), updateVendorById);
router.delete("/:id", authenticateJWT, authorize("vendor.edit"), deleteVendorById);

export default router;
