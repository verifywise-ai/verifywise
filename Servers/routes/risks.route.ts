import express from "express";
const router = express.Router();

import {
  getRiskById,
  getAllRisks,
  createRisk,
  updateRiskById,
  deleteRiskById,
  getRisksByProject,
  getRisksByFramework,
  bulkUpdateProjectRisks,
} from "../controllers/risks.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";

// GET requests
router.get("/", authenticateJWT, getAllRisks);
router.get("/by-projid/:id", authenticateJWT, getRisksByProject);
router.get("/by-frameworkid/:id", authenticateJWT, getRisksByFramework);
router.get("/:id", authenticateJWT, getRiskById);

// PATCH bulk update (Admin/Editor). Must come before generic /:id routes.
router.patch("/bulk", authenticateJWT, authorize(["Admin", "Editor"]), bulkUpdateProjectRisks);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, createRisk);
router.put("/:id", authenticateJWT, updateRiskById);
router.delete("/:id", authenticateJWT, deleteRiskById);

export default router;
