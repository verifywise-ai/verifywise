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

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/", authenticateJWT, getAllVendors);
router.get("/project-id/:id", authenticateJWT, getVendorByProjectId);
router.get("/:id", authenticateJWT, getVendorById);
// No ordering hazard: /:id matches one segment and cannot swallow this path.
// Read-only report, so authenticateJWT only — same as /dismissals and /duplicates.
router.get("/:id/riskSuggestions", authenticateJWT, getVendorRiskSuggestions);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, authorize("vendor.edit"), createVendor);
router.patch("/:id", authenticateJWT, authorize("vendor.edit"), updateVendorById);
router.delete("/:id", authenticateJWT, authorize("vendor.edit"), deleteVendorById);

export default router;
