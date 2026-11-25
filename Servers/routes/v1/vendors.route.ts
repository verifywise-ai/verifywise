/**
 * The vendor routes under /api/v1: the create and the update of a vendor, and the research routes
 * of a vendor (the state of its research, the trace of a run and starting a run).
 *
 * The vendor research agent came after ADR 0001, so its endpoints are versioned. The create and the
 * update take the other names and the identifiers of a vendor, which the frozen legacy contract
 * never had (ADR 0001 sections 1, 2 and 5), so they are served here too, as thin adapters over the
 * legacy controller. The code of the reads and the delete did not change: they stay on the legacy
 * /api/vendors (routes/vendor.route.ts) only, because ADR 0001 section 5 forbids a v1 copy of a
 * contract that did not change. Their responses carry the five nullable columns of the new fields.
 */
import express from "express";
const router = express.Router();

import { createVendorV1, updateVendorByIdV1 } from "../../controllers/vendor.ctrl";
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

// POST and PATCH requests
// Starting research spends searches and model calls, so it needs the right to edit vendors and
// their risks: the key of POST /vendorRisks and of createVendor, which already starts a run.
router.post("/:id/research", authenticateJWT, authorize("vendor.edit"), startVendorResearchRun);
// The create and the update take the other names and the identifiers, which the frozen legacy
// contract never had (ADR 0001 sections 1, 2 and 5). Thin adapters over the legacy controller, with
// vendor.edit as on the legacy routes.
router.post("/", authenticateJWT, authorize("vendor.edit"), createVendorV1);
router.patch("/:id", authenticateJWT, authorize("vendor.edit"), updateVendorByIdV1);

export default router;
