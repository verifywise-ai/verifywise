import express from "express";
const router = express.Router();

import {
  acceptVendorRiskFinding,
  dismissVendorRiskFinding,
  listVendorRiskFindings,
} from "../../controllers/vendorResearch.ctrl";

import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";

// GET requests
// Read-only, so authenticateJWT only: every role may see what research found.
router.get("/", authenticateJWT, listVendorRiskFindings);

// POST requests
// Deciding a finding changes the vendor risk register or the findings, so it needs the right to
// edit vendors and their risks: the key of POST /vendorRisks, which accepting a finding writes
// through, and of createVendor, which already starts a run.
router.post("/:id/accept", authenticateJWT, authorize("vendor.edit"), acceptVendorRiskFinding);
router.post("/:id/dismiss", authenticateJWT, authorize("vendor.edit"), dismissVendorRiskFinding);

export default router;
