import express from "express";
const router = express.Router();

import {
  createVendorRisk,
  deleteVendorRiskById,
  getAllVendorRisks,
  getVendorRiskById,
  updateVendorRiskById,
  getAllVendorRisksAllProjects,
  getAllVendorRisksByVendorId,
  getVendorRisksByFrameworkId,
} from "../controllers/vendorRisk.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/by-projid/:id", authenticateJWT, getAllVendorRisks);
router.get("/by-vendorid/:id", authenticateJWT, getAllVendorRisksByVendorId);
router.get("/by-frameworkid/:id", authenticateJWT, getVendorRisksByFrameworkId);
router.get("/all", authenticateJWT, getAllVendorRisksAllProjects);
router.get("/:id", authenticateJWT, getVendorRiskById);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, authorize("vendor.edit"), createVendorRisk);
router.patch("/:id", authenticateJWT, authorize("vendor.edit"), updateVendorRiskById);
router.delete("/:id", authenticateJWT, authorize("vendor.edit"), deleteVendorRiskById);

export default router;
