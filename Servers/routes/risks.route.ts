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
import {
  validateBulkUpdateProjectRisks,
  validateCreateRisk,
  validateRiskIdParam,
  validateUpdateRisk,
} from "../middleware/validators/risks.validator";

// GET requests
router.get("/", authenticateJWT, getAllRisks);
router.get("/by-projid/:id", authenticateJWT, validateRiskIdParam, getRisksByProject);
router.get("/by-frameworkid/:id", authenticateJWT, validateRiskIdParam, getRisksByFramework);
router.get("/:id", authenticateJWT, validateRiskIdParam, getRiskById);

// PATCH bulk update (Admin/Editor). Must come before generic /:id routes.
router.patch(
  "/bulk",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
  validateBulkUpdateProjectRisks,
  bulkUpdateProjectRisks,
);

// POST, PUT, DELETE requests
router.post("/", authenticateJWT, validateCreateRisk, createRisk);
router.put("/:id", authenticateJWT, validateUpdateRisk, updateRiskById);
router.delete("/:id", authenticateJWT, validateRiskIdParam, deleteRiskById);

export default router;
