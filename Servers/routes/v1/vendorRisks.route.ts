import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  getVendorRiskByIdIncludingDeleted,
  restoreVendorRiskById,
} from "../../controllers/vendorRisk.ctrl";

const router = express.Router();

// Deleted vendor risks: open one read-only and restore it (vendors audit
// decision 9). The legacy /api/vendorRisks contract is frozen: its GET still
// answers 404 for a deleted risk.
router.get("/:id", authenticateJWT, getVendorRiskByIdIncludingDeleted);
router.patch("/:id/restore", authenticateJWT, authorize("vendor.edit"), restoreVendorRiskById);

export default router;
