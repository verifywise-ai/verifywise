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
// edit risks.
router.post("/:id/accept", authenticateJWT, authorize("risks.edit"), acceptVendorRiskFinding);
router.post("/:id/dismiss", authenticateJWT, authorize("risks.edit"), dismissVendorRiskFinding);

export default router;
